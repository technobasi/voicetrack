import React, { useEffect, useRef } from 'react';
import { RotateCcw, Sliders, X } from 'lucide-react';
import { hzToNoteInfo } from '../audio/pitchEngine';
import { DEFAULT_VOICE_SETTINGS, VoiceSettings } from '../types/voice';

interface SettingsDialogProps {
  isOpen: boolean;
  settings: VoiceSettings;
  onClose: () => void;
  onUpdateSettings: (partial: Partial<VoiceSettings>) => void;
  onResetDefaults: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  settings,
  onClose,
  onUpdateSettings,
  onResetDefaults,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Mandatory modern-web-guidance fallback for <dialog closedby="any">
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    let handleBackdropClick: ((e: MouseEvent) => void) | null = null;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      handleBackdropClick = (event: MouseEvent) => {
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
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (handleBackdropClick) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
    };
  }, [onClose]);

  const applyTargetPreset = (minHz: number, maxHz: number) => {
    onUpdateSettings({ targetMinHz: minHz, targetMaxHz: maxHz });
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="settings-dialog-title"
      className="rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 p-6 shadow-2xl max-w-xl w-full m-auto"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-pink-400" />
            <h2 id="settings-dialog-title" className="text-base font-bold text-white">
              Frequenzbereiche & Discord-Einstellungen
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            aria-label="Dialog schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section 1: Personal Target Corridor Presets */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              1. Dein persönlicher Zielkorridor ({settings.targetMinHz} – {settings.targetMaxHz} Hz ·{' '}
              {hzToNoteInfo(settings.targetMinHz).noteName} bis{' '}
              {hzToNoteInfo(settings.targetMaxHz).noteName})
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.showTargetCorridor !== false}
                onChange={(e) =>
                  onUpdateSettings({ showTargetCorridor: e.target.checked })
                }
              />
              <span>Im Graphen anzeigen</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {[
              { label: 'Sanfter Einstieg', min: 170, max: 205 },
              { label: 'VoiceTools Standard', min: 185, max: 225 },
              { label: 'Hell & Feminin', min: 195, max: 240 },
            ].map((p) => {
              const active =
                settings.targetMinHz === p.min && settings.targetMaxHz === p.max;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyTargetPreset(p.min, p.max)}
                  className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                    active
                      ? 'border-emerald-400 bg-emerald-500/15 text-white'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-bold">{p.label}</div>
                  <div className="text-[11px] text-emerald-300">
                    {p.min}–{p.max} Hz ({hzToNoteInfo(p.min).noteName}–
                    {hzToNoteInfo(p.max).noteName})
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Untergrenze Ziel: <strong>{settings.targetMinHz} Hz</strong>
              </label>
              <input
                type="range"
                min={140}
                max={230}
                value={settings.targetMinHz}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateSettings({
                    targetMinHz: val,
                    targetMaxHz: Math.max(val + 15, settings.targetMaxHz),
                  });
                }}
                className="w-full cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Obergrenze Ziel: <strong>{settings.targetMaxHz} Hz</strong>
              </label>
              <input
                type="range"
                min={165}
                max={280}
                value={settings.targetMaxHz}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateSettings({
                    targetMaxHz: val,
                    targetMinHz: Math.min(val - 15, settings.targetMinHz),
                  });
                }}
                className="w-full cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Zone Boundaries (Maskulin / Androgyn / Feminin) */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="text-xs font-bold uppercase tracking-wider text-pink-400">
            2. Zonengrenzen (Feminin / Androgyn / Maskulin)
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-purple-300 font-semibold">
                  Schwelle Maskulin → Androgyn:
                </span>
                <span className="font-bold text-white">{settings.androgynousMinHz} Hz</span>
              </div>
              <input
                type="range"
                min={135}
                max={180}
                value={settings.androgynousMinHz}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onUpdateSettings({
                    masculineMaxHz: v,
                    androgynousMinHz: v,
                    feminineMinHz: Math.max(v + 10, settings.feminineMinHz),
                    androgynousMaxHz: Math.max(v + 10, settings.feminineMinHz),
                  });
                }}
                className="w-full cursor-pointer"
              />
              <div className="text-[11px] text-slate-400">
                Standard in VoiceTools: 165 Hz ({hzToNoteInfo(165).noteName})
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-pink-300 font-semibold">
                  Schwelle Androgyn → Feminin:
                </span>
                <span className="font-bold text-white">{settings.feminineMinHz} Hz</span>
              </div>
              <input
                type="range"
                min={165}
                max={215}
                value={settings.feminineMinHz}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onUpdateSettings({
                    androgynousMaxHz: v,
                    feminineMinHz: v,
                    androgynousMinHz: Math.min(v - 10, settings.androgynousMinHz),
                    masculineMaxHz: Math.min(v - 10, settings.androgynousMinHz),
                  });
                }}
                className="w-full cursor-pointer"
              />
              <div className="text-[11px] text-slate-400">
                Standard in VoiceTools: 185 Hz ({hzToNoteInfo(185).noteName})
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Discord Alert & Audio Settings */}
        <div className="space-y-3 pt-2 border-t border-slate-800 text-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-purple-300">
            3. Discord-Feedback & Mikrofon-Verarbeitung
          </div>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span>
              Sanfter visueller Hinweis, wenn die Stimme beim Reden unter den Zielbereich fällt
            </span>
            <input
              type="checkbox"
              checked={settings.enableDropAlert}
              onChange={(e) => onUpdateSettings({ enableDropAlert: e.target.checked })}
            />
          </label>

          {settings.enableDropAlert && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400">
                Verzögerung vor optischem Hinweis: <strong>{settings.dropAlertSeconds}s</strong>
              </span>
              <input
                type="range"
                min={1.0}
                max={6.0}
                step={0.5}
                value={settings.dropAlertSeconds}
                onChange={(e) =>
                  onUpdateSettings({ dropAlertSeconds: Number(e.target.value) })
                }
                className="w-36 cursor-pointer"
              />
            </div>
          )}

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span>
              Roh-Audiosignal für präzise Formanten nutzen (deaktiviert Browser-Filter)
            </span>
            <input
              type="checkbox"
              checked={settings.rawAudioMode}
              onChange={(e) => onUpdateSettings({ rawAudioMode: e.target.checked })}
            />
          </label>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={() => {
              onResetDefaults();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-300 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Auf VoiceTools-Standard zurücksetzen ({DEFAULT_VOICE_SETTINGS.feminineMinHz} Hz)</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-pink-600 hover:bg-pink-500 px-5 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            Fertig
          </button>
        </div>
      </div>
    </dialog>
  );
};
