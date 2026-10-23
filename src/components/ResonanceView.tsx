import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Radio, Sparkles, Waves } from 'lucide-react';
import {
  DemoVoiceProfile,
  PitchSample,
  SessionStats,
  VoiceSettings,
} from '../types/voice';

interface ResonanceViewProps {
  isListening: boolean;
  demoProfile: DemoVoiceProfile;
  currentSample: PitchSample | null;
  samples: PitchSample[];
  stats: SessionStats;
  spectrumDb: Float32Array;
  sampleRate: number;
  settings: VoiceSettings;
  onStartMic: () => void;
  onStartDemo: (profile: Exclude<DemoVoiceProfile, 'off'>) => void;
  onStop: () => void;
}

export const ResonanceView: React.FC<ResonanceViewProps> = ({
  isListening,
  demoProfile,
  currentSample,
  samples,
  stats,
  spectrumDb,
  sampleRate,
  settings,
  onStartMic,
  onStartDemo,
  onStop,
}) => {
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrogramCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrogramColumnsRef = useRef<Uint8Array[]>([]);

  // 1. Draw FFT Spectrum + Formant Markers (0..3800 Hz)
  useEffect(() => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, rect.width || 520);
    const height = 250;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0d1322';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 40;
    const padRight = 20;
    const padTop = 18;
    const padBottom = 28;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const maxFreq = 3600;
    const binHz = sampleRate / 4096;

    const freqToX = (f: number) => padLeft + Math.min(1, Math.max(0, f / maxFreq)) * plotW;
    const dbToY = (db: number) => {
      const clamped = Math.max(-100, Math.min(-15, db));
      const ratio = (clamped + 100) / 85;
      return padTop + plotH * (1 - ratio);
    };

    // Highlight feminine F2 bright resonance band (1800–2550 Hz)
    const f2BandX1 = freqToX(1800);
    const f2BandX2 = freqToX(2550);
    ctx.fillStyle = 'rgba(244, 114, 182, 0.11)';
    ctx.fillRect(f2BandX1, padTop, f2BandX2 - f2BandX1, plotH);
    ctx.fillStyle = 'rgba(244, 114, 182, 0.8)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Helle F2-Zone (1.8–2.5 kHz)', (f2BandX1 + f2BandX2) / 2, padTop + 12);

    // Frequency grid lines
    for (const freq of [500, 1000, 1500, 2000, 2500, 3000, 3500]) {
      const x = freqToX(freq);
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${freq >= 1000 ? `${freq / 1000}k` : freq} Hz`, x, padTop + plotH + 16);
    }

    // Draw Spectrum Curve
    ctx.beginPath();
    const maxBin = Math.min(spectrumDb.length - 1, Math.ceil(maxFreq / binHz));
    for (let i = 0; i <= maxBin; i++) {
      const x = freqToX(i * binHz);
      const y = dbToY(spectrumDb[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    grad.addColorStop(0, 'rgba(244, 114, 182, 0.35)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw F0, F1, F2 vertical markers if voiced
    const drawMarker = (hz: number | null, label: string, color: string) => {
      if (!hz || hz <= 0 || hz > maxFreq) return;
      const x = freqToX(hz);
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${label}: ${Math.round(hz)} Hz`, x, padTop + 26);
    };

    if (currentSample?.hz) {
      drawMarker(currentSample.hz, 'F0', '#34d399');
      drawMarker(currentSample.f1Hz, 'F1', '#38bdf8');
      drawMarker(currentSample.f2Hz, 'F2', '#f472b6');
    }

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.strokeRect(padLeft, padTop, plotW, plotH);
    ctx.restore();
  }, [spectrumDb, sampleRate, currentSample]);

  // 2. Draw 2D Pitch (X) vs Resonance Brightness (Y) Target Matrix
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, rect.width || 420);
    const height = 250;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0d1322';
    ctx.fillRect(0, 0, width, height);

    const pad = 36;
    const plotW = width - pad * 2;
    const plotH = height - pad * 1.8;

    const minHz = 95;
    const maxHz = 260;

    const hzToX = (hz: number) =>
      pad + Math.max(0, Math.min(1, (hz - minHz) / (maxHz - minHz))) * plotW;
    const brightToY = (b: number) =>
      18 + (1 - Math.max(0, Math.min(100, b)) / 100) * plotH;

    const splitX = hzToX(settings.feminineMinHz);
    const splitY = brightToY(62);

    // Top-right target quadrant (Feminin & Hell)
    ctx.fillStyle = 'rgba(244, 114, 182, 0.14)';
    ctx.fillRect(splitX, 18, pad + plotW - splitX, splitY - 18);

    // Bottom-left quadrant (Maskulin & Dunkel)
    ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.fillRect(pad, splitY, splitX - pad, 18 + plotH - splitY);

    // Divider lines
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.25)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(splitX, 18);
    ctx.lineTo(splitX, 18 + plotH);
    ctx.moveTo(pad, splitY);
    ctx.lineTo(pad + plotW, splitY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Quadrant Labels
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = '#f472b6';
    ctx.textAlign = 'right';
    ctx.fillText('HELL & FEMININ (Ziel)', pad + plotW - 8, 32);

    ctx.fillStyle = '#c084fc';
    ctx.textAlign = 'left';
    ctx.fillText('Helle Resonanz / Tiefere F0', pad + 8, 32);

    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText('Hohe F0 / Dunkle Resonanz', pad + plotW - 8, 18 + plotH - 8);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText('Dunkel & Maskulin', pad + 8, 18 + plotH - 8);

    // Plot recent voiced trail
    const recentVoiced = samples
      .filter((s): s is PitchSample & { hz: number } => s.hz !== null)
      .slice(-35);

    for (let i = 0; i < recentVoiced.length; i++) {
      const s = recentVoiced[i];
      const x = hzToX(s.hz);
      const y = brightToY(s.brightness);
      const alpha = ((i + 1) / recentVoiced.length) * 0.75;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle =
        s.zone === 'feminin'
          ? `rgba(244, 114, 182, ${alpha})`
          : s.zone === 'androgyn'
            ? `rgba(192, 132, 252, ${alpha})`
            : `rgba(56, 189, 248, ${alpha})`;
      ctx.fill();
    }

    // Current voice point
    if (currentSample?.hz) {
      const cx = hzToX(currentSample.hz);
      const cy = brightToY(currentSample.brightness);
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(244, 114, 182, 0.3)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f472b6';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.strokeRect(pad, 18, plotW, plotH);

    // Axis titles
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('Tonhöhe F0 (Hz) →', pad + plotW / 2, 18 + plotH + 18);

    ctx.restore();
  }, [samples, currentSample, settings.feminineMinHz]);

  // 3. Draw Rolling Time-Frequency Spectrogram + F1/F2 Formant Tracks (0..3200 Hz)
  useEffect(() => {
    const canvas = spectrogramCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const numBands = 48;
    const maxFreq = 3200;
    const binHz = sampleRate / 4096;

    if (isListening) {
      const col = new Uint8Array(numBands);
      for (let b = 0; b < numBands; b++) {
        const fCenter = ((b + 0.5) / numBands) * maxFreq;
        const bin = Math.min(spectrumDb.length - 1, Math.max(0, Math.round(fCenter / binHz)));
        const db = spectrumDb[bin] ?? -100;
        const norm = Math.max(0, Math.min(1, (db + 95) / 70));
        col[b] = Math.round(norm * 255);
      }
      spectrogramColumnsRef.current.push(col);
      if (spectrogramColumnsRef.current.length > 140) {
        spectrogramColumnsRef.current.shift();
      }
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, rect.width || 680);
    const height = 190;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0d1322';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 46;
    const padRight = 18;
    const padTop = 14;
    const padBottom = 22;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const freqToY = (f: number) =>
      padTop + (1 - Math.max(0, Math.min(1, f / maxFreq))) * plotH;

    // Draw spectrogram heatmap columns
    const cols = spectrogramColumnsRef.current;
    const maxCols = 120;
    const colW = plotW / maxCols;
    const bandH = plotH / numBands;

    for (let c = 0; c < cols.length; c++) {
      const col = cols[c];
      const x = padLeft + (maxCols - cols.length + c) * colW;
      for (let b = 0; b < numBands; b++) {
        const val = col[b];
        if (val < 18) continue;
        const alpha = (val / 255) * 0.65;
        const y = padTop + (numBands - 1 - b) * bandH;
        ctx.fillStyle =
          val > 175
            ? `rgba(244, 114, 182, ${alpha})`
            : val > 105
              ? `rgba(192, 132, 252, ${alpha})`
              : `rgba(56, 189, 248, ${alpha * 0.8})`;
        ctx.fillRect(x, y, colW + 0.8, bandH + 0.8);
      }
    }

    // Highlight bright F2 target zone (1800–2550 Hz)
    const yTopF2 = freqToY(2550);
    const yBotF2 = freqToY(1800);
    ctx.fillStyle = 'rgba(244, 114, 182, 0.08)';
    ctx.fillRect(padLeft, yTopF2, plotW, yBotF2 - yTopF2);
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, yTopF2);
    ctx.lineTo(padLeft + plotW, yTopF2);
    ctx.moveTo(padLeft, yBotF2);
    ctx.lineTo(padLeft + plotW, yBotF2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Frequency grid & labels on Y axis
    for (const freq of [500, 1000, 1800, 2500, 3000]) {
      const y = freqToY(freq);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();

      ctx.fillStyle = freq === 1800 || freq === 2500 ? '#f472b6' : '#94a3b8';
      ctx.font = '500 10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${freq} Hz`, padLeft - 6, y + 3);
    }

    // Overlay F1 & F2 formant tracks from recent samples
    const recentSamples = samples.slice(-maxCols);
    const drawFormantTrack = (
      getter: (s: PitchSample) => number | null,
      color: string
    ) => {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < recentSamples.length; i++) {
        const val = getter(recentSamples[i]);
        const x = padLeft + (maxCols - recentSamples.length + i + 0.5) * colW;
        if (val !== null && val > 0) {
          const y = freqToY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        } else {
          started = false;
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    };

    drawFormantTrack((s) => s.f2Hz, '#f472b6');
    drawFormantTrack((s) => s.f1Hz, '#38bdf8');
    drawFormantTrack((s) => s.hz, '#34d399');

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.strokeRect(padLeft, padTop, plotW, plotH);
    ctx.restore();
  }, [spectrumDb, sampleRate, samples, isListening]);

  return (
    <div className="space-y-5 tabular-nums">
      {/* Header & Controls */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Waves className="w-5 h-5 text-pink-400" />
            <span>Resonanz, Formanten (F1 / F2) & Klangfarbe</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Stimmfeminisierung entsteht durch das Zusammenspiel aus Grundfrequenz (F0) und einer
            helleren Mundraum-Resonanz (höherer zweiter Formant F2 ab ca. 1850 Hz).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isListening || demoProfile !== 'off' ? (
            <button
              type="button"
              onClick={onStartMic}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              <span>Mikrofon starten</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              <MicOff className="w-4 h-4" />
              <span>Stoppen</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              demoProfile === 'feminin' ? onStartDemo('maskulin') : onStartDemo('feminin')
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>
              {demoProfile === 'feminin'
                ? 'Vergleich: Dunkle Resonanz (Demo)'
                : 'Vergleich: Helle Resonanz (Demo)'}
            </span>
          </button>
        </div>
      </div>

      {/* Live Formant Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
          <div className="text-xs font-semibold uppercase text-slate-400">
            Formant F1 (Rachenraum / Öffnung)
          </div>
          <div className="text-2xl font-extrabold text-sky-400 mt-1">
            {currentSample?.f1Hz ? `${currentSample.f1Hz} Hz` : stats.meanF1Hz ? `Ø ${stats.meanF1Hz} Hz` : '— Hz'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Steuert die Vokalöffnung. Ein leicht angehobener Kehlkopf verkleinert den Rachenraum.
          </p>
        </div>

        <div className="rounded-2xl border border-pink-500/30 bg-slate-900/75 p-4">
          <div className="text-xs font-semibold uppercase text-pink-300">
            Formant F2 (Mundraum-Helligkeit)
          </div>
          <div className="text-2xl font-extrabold text-pink-400 mt-1">
            {currentSample?.f2Hz ? `${currentSample.f2Hz} Hz` : stats.meanF2Hz ? `Ø ${stats.meanF2Hz} Hz` : '— Hz'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Schlüsselwert für Stimmfeminisierung! Ziel bei hellen Vokalen: <strong>1800–2450 Hz</strong>.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
          <div className="text-xs font-semibold uppercase text-slate-400">
            Klangfarben-Index (Brightness)
          </div>
          <div className="text-2xl font-extrabold text-purple-300 mt-1">
            {currentSample?.hz
              ? `${currentSample.brightness}%`
              : stats.meanBrightness
                ? `Ø ${stats.meanBrightness}%`
                : '— %'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Ab <strong>62%</strong> wirkt die Stimmfarbe deutlich weicher, vordergründiger und femininer.
          </p>
        </div>
      </div>

      {/* 2 Visual Canvases Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-pink-400" />
              <span>2D Ziel-Matrix: Tonhöhe (F0) × Resonanz-Helligkeit</span>
            </h3>
            <span className="text-xs text-slate-400">Ziel: Oben rechts</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-slate-800">
            <canvas
              ref={radarCanvasRef}
              className="block w-full h-[250px]"
              aria-label="2D-Zielmatrix aus Tonhöhe und Resonanz"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Waves className="w-4 h-4 text-purple-400" />
              <span>Live Oberton-Spektrum & Formanten (0 – 3.6 kHz)</span>
            </h3>
            <span className="text-xs text-slate-400">F0 · F1 · F2</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-slate-800">
            <canvas
              ref={spectrumCanvasRef}
              className="block w-full h-[250px]"
              aria-label="Live Frequenzspektrum mit Formanten F1 und F2"
            />
          </div>
        </div>
      </div>

      {/* Full-Width Time-Frequency Waterfall Spectrogram + F0/F1/F2 Tracks */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Waves className="w-4 h-4 text-pink-400" />
            <span>Zeit-Frequenz-Spektrogramm & Formant-Verlauf (F0 / F1 / F2 über Zeit)</span>
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-pink-300">
              <span className="h-2 w-2 rounded-full bg-pink-400" />
              <span>F2-Spur (Ziel: 1800–2550 Hz)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-sky-300">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              <span>F1-Spur (Rachenöffnung)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>F0-Grundfrequenz</span>
            </span>
          </div>
        </div>
        <div className="rounded-xl overflow-hidden border border-slate-800">
          <canvas
            ref={spectrogramCanvasRef}
            className="block w-full h-[190px]"
            aria-label="Zeit-Frequenz-Spektrogramm mit Formant-Spuren"
          />
        </div>
      </div>

      {/* Practical Resonance Exercises */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-1.5">
          <div className="text-xs font-bold text-pink-300 uppercase">
            1. Übung: Vorderzungen-Anker (/ng/ → /i/)
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Bilde den Laut „ng“ wie in „singen“. Spüre, wie sich der Zungenrücken hebt und den
            Mundraum verkleinert. Gleite von dort in ein helles „iiii“ und halte dieses Raumgefühl
            für ganze Sätze bei.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-1.5">
          <div className="text-xs font-bold text-purple-300 uppercase">
            2. Übung: Flüster-Sirene (Kehlkopf-Position)
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Hauche ein tonloses „hch“ (wie in „ich“) und lasse das Rauschen von dunkel (wie beim
            Gähnen) nach ganz hell gleiten. Setze oben sanft deine Stimme auf, ohne im Hals zu
            drücken.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-1.5">
          <div className="text-xs font-bold text-emerald-300 uppercase">
            3. Übung: Stimmgewicht (Vocal Weight) reduzieren
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Eine feminine Stimme entsteht nicht durch Lautstärke-Druck, sondern durch dünneren,
            weicheren Stimmlippenschluss. Sprich so sanft, als würdest du jemandem direkt gegenüber
            sitzen.
          </p>
        </div>
      </div>
    </div>
  );
};
