import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Minimize2, Sparkles, AlertTriangle } from 'lucide-react';
import { hzToNoteInfo } from '../audio/pitchEngine';
import { PitchSample, SessionStats, VoiceSettings } from '../types/voice';
import { PitchGraphCanvas } from './PitchGraphCanvas';

interface DocumentPictureInPicture {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

interface DiscordPipOverlayProps {
  currentSample: PitchSample | null;
  samples: PitchSample[];
  liveSamplesRef?: React.RefObject<PitchSample[]>;
  liveCurrentSampleRef?: React.RefObject<PitchSample | null>;
  stats: SessionStats;
  settings: VoiceSettings;
  isListening: boolean;
  isDropAlertActive: boolean;
  compactMode: boolean;
  onToggleCompactMode: () => void;
}

export const DiscordPipOverlay: React.FC<DiscordPipOverlayProps> = ({
  currentSample,
  samples,
  liveSamplesRef,
  liveCurrentSampleRef,
  stats,
  settings,
  isListening,
  isDropAlertActive,
  compactMode,
  onToggleCompactMode,
}) => {
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const pipWindowRef = useRef<Window | null>(null);

  const closePip = useCallback(() => {
    if (pipWindowRef.current) {
      try {
        pipWindowRef.current.close();
      } catch {
        // Ignore
      }
      pipWindowRef.current = null;
    }
    setPipContainer(null);
  }, []);

  const openDocumentPip = useCallback(async () => {
    if (pipWindowRef.current) {
      closePip();
      return;
    }

    if (window.documentPictureInPicture) {
      try {
        const pipWin = await window.documentPictureInPicture.requestWindow({
          width: 380,
          height: 290,
        });
        pipWindowRef.current = pipWin;

        // Copy stylesheets into PiP window
        Array.from(document.styleSheets).forEach((styleSheet) => {
          try {
            const cssRules = Array.from(styleSheet.cssRules)
              .map((r) => r.cssText)
              .join('');
            const style = pipWin.document.createElement('style');
            style.textContent = cssRules;
            pipWin.document.head.appendChild(style);
          } catch {
            if (styleSheet.href) {
              const link = pipWin.document.createElement('link');
              link.rel = 'stylesheet';
              link.href = styleSheet.href;
              pipWin.document.head.appendChild(link);
            }
          }
        });

        pipWin.document.title = 'VoiceTrack – Discord Mini-Overlay';
        pipWin.document.body.style.margin = '0';
        pipWin.document.body.style.backgroundColor = '#0b0f19';
        pipWin.document.body.style.color = '#f8fafc';

        const rootDiv = pipWin.document.createElement('div');
        pipWin.document.body.appendChild(rootDiv);
        setPipContainer(rootDiv);

        pipWin.addEventListener('pagehide', () => {
          pipWindowRef.current = null;
          setPipContainer(null);
        });
        return;
      } catch {
        // Fallback to compact mode if PiP fails or is blocked
      }
    }

    // Fallback: toggle in-page compact Discord widget mode
    onToggleCompactMode();
  }, [closePip, onToggleCompactMode]);

  useEffect(() => {
    return () => {
      closePip();
    };
  }, [closePip]);

  const hz = currentSample?.hz ?? null;
  const note = hz ? hzToNoteInfo(hz) : null;
  const zone = currentSample?.zone ?? null;

  const zoneBadge =
    zone === 'feminin'
      ? { label: 'Feminin', bg: 'bg-pink-500/20 text-pink-300 border-pink-500/40' }
      : zone === 'androgyn'
        ? { label: 'Androgyn', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40' }
        : zone === 'maskulin'
          ? { label: 'Maskulin', bg: 'bg-sky-500/20 text-sky-300 border-sky-500/40' }
          : { label: 'Sprechpause', bg: 'bg-slate-800 text-slate-400 border-slate-700' };

  const widgetContent = (
    <div
      className={`flex flex-col gap-2.5 p-3 bg-[#0b0f19] text-slate-100 min-h-full ${
        isDropAlertActive ? 'discord-drop-alert ring-2 ring-amber-400/80' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              isListening ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
            }`}
          />
          <span className="text-xs font-semibold tracking-wide uppercase text-slate-400">
            Discord Companion
          </span>
        </div>
        <span
          className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${zoneBadge.bg}`}
        >
          {zoneBadge.label}
        </span>
      </div>

      {/* Big Live Pitch & Note */}
      <div className="flex items-baseline justify-between bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2">
        <div>
          <div className="text-2xl font-bold tracking-tight text-white">
            {hz !== null ? `${Math.round(hz)} Hz` : '— Hz'}
          </div>
          <div className="text-xs text-slate-400">
            Ø Session: <strong className="text-slate-200">{stats.meanHz || '—'} Hz</strong> · Ziel:{' '}
            {settings.targetMinHz}–{settings.targetMaxHz} Hz
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-pink-400">
            {note ? note.noteName : '—'}
          </div>
          <div className="text-[11px] text-slate-400">
            Helligkeit: {currentSample?.hz ? `${currentSample.brightness}%` : '—'}
          </div>
        </div>
      </div>

      {isDropAlertActive && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/15 border border-amber-400/40 px-2.5 py-1.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Tonhöhe seit {settings.dropAlertSeconds}s unter Zielbereich – sanft anheben</span>
        </div>
      )}

      {/* Mini Pitch Sparkline */}
      <PitchGraphCanvas
        samples={samples}
        currentSample={currentSample}
        liveSamplesRef={liveSamplesRef}
        liveCurrentSampleRef={liveCurrentSampleRef}
        settings={settings}
        height={115}
        windowSeconds={10}
        compact={true}
        isListening={isListening}
      />

      {/* Distribution bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] font-medium">
          <span className="text-pink-400">Fem {stats.femininePercent}%</span>
          <span className="text-purple-400">Andro {stats.androgynousPercent}%</span>
          <span className="text-sky-400">Mask {stats.masculinePercent}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex">
          <div
            style={{ width: `${stats.femininePercent}%` }}
            className="bg-pink-400 transition-all duration-300"
          />
          <div
            style={{ width: `${stats.androgynousPercent}%` }}
            className="bg-purple-400 transition-all duration-300"
          />
          <div
            style={{ width: `${stats.masculinePercent}%` }}
            className="bg-sky-400 transition-all duration-300"
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openDocumentPip}
          className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-200 transition cursor-pointer"
          title="Öffnet ein kleines schwebendes Always-on-Top Fenster für Discord oder Spiele"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>{pipContainer ? 'PiP-Overlay schließen' : 'Discord Mini-Overlay (PiP)'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleCompactMode}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
            compactMode
              ? 'border-pink-500/50 bg-pink-500/20 text-pink-200'
              : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300'
          }`}
          title="Kompakte Ansicht für schmale Fenster neben Discord"
        >
          {compactMode ? <Sparkles className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          <span>{compactMode ? 'Vollansicht' : 'Kompakt-Ansicht'}</span>
        </button>
      </div>

      {pipContainer && createPortal(widgetContent, pipContainer)}
    </>
  );
};
