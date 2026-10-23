import React, { useEffect, useRef } from 'react';
import { hzToNoteInfo } from '../audio/pitchEngine';
import { PitchSample, PitchZone, VoiceSettings } from '../types/voice';

interface PitchGraphCanvasProps {
  samples: PitchSample[];
  currentSample: PitchSample | null;
  liveSamplesRef?: React.RefObject<PitchSample[]>;
  liveCurrentSampleRef?: React.RefObject<PitchSample | null>;
  settings: VoiceSettings;
  height?: number;
  windowSeconds?: number;
  compact?: boolean;
  playbackProgress?: number | null; // 0..1 when replaying recorded reading passage
  isListening?: boolean;
  isPaused?: boolean;
}

interface PlotPoint {
  x: number;
  y: number;
  hz: number;
  timestamp: number;
  zone: PitchZone | null;
}

function getZoneColor(zone: PitchZone | null): string {
  switch (zone) {
    case 'feminin':
      return '#f472b6'; // Rose-400
    case 'androgyn':
      return '#c084fc'; // Purple-400
    case 'maskulin':
      return '#38bdf8'; // Sky-400
    default:
      return '#94a3b8';
  }
}

/**
 * Draws an interpolating Catmull-Rom cubic spline that passes directly through every point
 * so all vocal peaks, valleys, and micro-fluctuations are preserved at full amplitude.
 */
function traceSmoothSpline(ctx: CanvasRenderingContext2D, pts: PlotPoint[]): void {
  if (pts.length === 0) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) {
    ctx.lineTo(pts[0].x + 0.5, pts[0].y);
    return;
  }
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  const tension = 0.35;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];

    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 3;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 3;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 3;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 3;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

export const PitchGraphCanvas: React.FC<PitchGraphCanvasProps> = ({
  samples,
  currentSample,
  liveSamplesRef,
  liveCurrentSampleRef,
  settings,
  height = 340,
  windowSeconds = 18,
  compact = false,
  playbackProgress = null,
  isListening = false,
  isPaused = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawFnRef = useRef<() => void>(() => {});

  const stateRef = useRef({
    samples,
    currentSample,
    liveSamplesRef,
    liveCurrentSampleRef,
    settings,
    height,
    windowSeconds,
    compact,
    playbackProgress,
    isListening,
    isPaused,
  });
  stateRef.current = {
    samples,
    currentSample,
    liveSamplesRef,
    liveCurrentSampleRef,
    settings,
    height,
    windowSeconds,
    compact,
    playbackProgress,
    isListening,
    isPaused,
  };

  drawFnRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const {
      samples: fallbackSamples,
      currentSample: fallbackSample,
      liveSamplesRef: liveSRef,
      liveCurrentSampleRef: liveCSRef,
      settings: cfg,
      height: drawHeight,
      windowSeconds: winSec,
      compact: isCompact,
      playbackProgress: playProg,
      isListening: listening,
      isPaused: paused,
    } = stateRef.current;

    const curSamples = liveSRef?.current ?? fallbackSamples;
    const curSample = liveCSRef?.current ?? fallbackSample;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(240, Math.round(rect.width || 640));

    if (
      canvas.width !== Math.floor(width * dpr) ||
      canvas.height !== Math.floor(drawHeight * dpr)
    ) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(drawHeight * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const minHz = cfg.graphMinHz;
    const maxHz = cfg.graphMaxHz;

    const padLeft = isCompact ? 38 : 54;
    const padRight = isCompact ? 42 : 68;
    const padTop = 14;
    const padBottom = isCompact ? 20 : 28;
    const plotW = Math.max(50, width - padLeft - padRight);
    const plotH = Math.max(50, drawHeight - padTop - padBottom);

    // Non-linear focal scale (Fokus-Skala):
    // Allocates 74% of vertical height to the core Maskulin / Androgyn / Feminin corridor (85–255 Hz)
    // and compresses the outer extremes (50–85 Hz -> bottom 8%, 255–450 Hz -> top 18%).
    const b0 = minHz;
    const b1 = Math.max(b0 + 10, cfg.masculineMinHz);
    const b2 = Math.max(b1 + 15, cfg.androgynousMinHz);
    const b3 = Math.max(b2 + 8, cfg.feminineMinHz);
    const b4 = Math.max(b3 + 20, cfg.feminineMaxHz);
    const b5 = Math.max(b4 + 20, maxHz);

    const n0 = 0.0;
    const n1 = 0.08; // 50–85 Hz: 8% (grobmaschig unten)
    const n2 = 0.34; // 85–165 Hz (Maskulin): 26%
    const n3 = 0.50; // 165–185 Hz (Androgyn): 16% (stark vergrößert für feine Details)
    const n4 = 0.82; // 185–255 Hz (Feminin): 32% (großer Detailbereich)
    const n5 = 1.0;  // 255–450 Hz: 18% (grobmaschig oben)

    const hzToNorm = (hz: number): number => {
      const clamped = Math.max(b0, Math.min(b5, hz));
      if (clamped <= b1) {
        return n0 + ((clamped - b0) / (b1 - b0)) * (n1 - n0);
      }
      if (clamped <= b2) {
        return n1 + ((clamped - b1) / (b2 - b1)) * (n2 - n1);
      }
      if (clamped <= b3) {
        return n2 + ((clamped - b2) / (b3 - b2)) * (n3 - n2);
      }
      if (clamped <= b4) {
        return n3 + ((clamped - b3) / (b4 - b3)) * (n4 - n3);
      }
      return n4 + ((clamped - b4) / (b5 - b4)) * (n5 - n4);
    };

    const hzToY = (hz: number): number => {
      return padTop + plotH * (1 - hzToNorm(hz));
    };

    // Clear background
    ctx.fillStyle = '#0d1322';
    ctx.fillRect(0, 0, width, drawHeight);

    // 1. Draw Zone Background Bands across 50–450 Hz
    const highTop = hzToY(maxHz);
    const femTop = hzToY(Math.min(maxHz, cfg.feminineMaxHz));
    const femBot = hzToY(Math.max(minHz, cfg.feminineMinHz));
    if (femTop > highTop) {
      ctx.fillStyle = 'rgba(244, 114, 182, 0.05)';
      ctx.fillRect(padLeft, highTop, plotW, femTop - highTop);
    }
    if (femBot > femTop) {
      const gradFem = ctx.createLinearGradient(0, femTop, 0, femBot);
      gradFem.addColorStop(0, 'rgba(244, 114, 182, 0.18)');
      gradFem.addColorStop(1, 'rgba(244, 114, 182, 0.09)');
      ctx.fillStyle = gradFem;
      ctx.fillRect(padLeft, femTop, plotW, femBot - femTop);
    }

    const androTop = hzToY(Math.min(maxHz, cfg.androgynousMaxHz));
    const androBot = hzToY(Math.max(minHz, cfg.androgynousMinHz));
    if (androBot > androTop) {
      ctx.fillStyle = 'rgba(192, 132, 252, 0.15)';
      ctx.fillRect(padLeft, androTop, plotW, androBot - androTop);
    }

    const mascTop = hzToY(Math.min(maxHz, cfg.masculineMaxHz));
    const mascBot = hzToY(Math.max(minHz, cfg.masculineMinHz));
    const lowBot = hzToY(minHz);
    if (mascBot > mascTop) {
      const gradMasc = ctx.createLinearGradient(0, mascTop, 0, mascBot);
      gradMasc.addColorStop(0, 'rgba(56, 189, 248, 0.09)');
      gradMasc.addColorStop(1, 'rgba(56, 189, 248, 0.16)');
      ctx.fillStyle = gradMasc;
      ctx.fillRect(padLeft, mascTop, plotW, mascBot - mascTop);
    }
    if (lowBot > mascBot) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
      ctx.fillRect(padLeft, mascBot, plotW, lowBot - mascBot);
    }

    // Determine timeline window (continuous real-time sliding vs smart-pause)
    const windowMs = winSec * 1000;
    const useSmartPause = cfg.smartPauseCompress && playProg === null;
    const latestSample = curSamples.length > 0 ? curSamples[curSamples.length - 1] : null;

    const nowMs = Date.now();
    const latestTime = useSmartPause
      ? (latestSample?.speakingTimeMs ?? 0)
      : listening && !paused && playProg === null
        ? nowMs
        : (latestSample?.timestamp ?? nowMs);

    const startTime =
      playProg !== null && curSamples.length > 1
        ? curSamples[0].timestamp
        : latestTime - windowMs;

    const totalSpanMs =
      playProg !== null && curSamples.length > 1 && latestSample
        ? Math.max(1000, latestSample.timestamp - curSamples[0].timestamp)
        : windowMs;

    // 1b. Draw Sliding Vertical Time Grid Lines
    if (!useSmartPause && playProg === null) {
      const stepSec = winSec <= 12 ? 2 : winSec <= 25 ? 5 : winSec <= 50 ? 10 : 15;
      const stepMs = stepSec * 1000;
      const firstGridTick = Math.ceil(startTime / stepMs) * stepMs;

      ctx.font = isCompact
        ? '500 9px system-ui, sans-serif'
        : '500 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (let tick = firstGridTick; tick <= latestTime; tick += stepMs) {
        const xRatio = (tick - startTime) / totalSpanMs;
        const x = padLeft + xRatio * plotW;

        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + plotH);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const secAgo = Math.round((latestTime - tick) / 1000);
        if (x > padLeft + 18 && x < padLeft + plotW - 22) {
          ctx.fillStyle = '#64748b';
          ctx.fillText(`-${secAgo}s`, x, padTop + plotH + 6);
        }
      }

      ctx.fillStyle = listening && !paused ? '#f472b6' : '#64748b';
      ctx.textAlign = 'right';
      ctx.fillText('Jetzt', padLeft + plotW, padTop + plotH + 6);
    }

    // 2. Draw Horizontal Grid Lines & Labels (Fine-grained in 85–255 Hz, coarse in 50–85 & 255–450 Hz)
    const androMid = Math.round((cfg.androgynousMinHz + cfg.feminineMinHz) / 2);
    const femStep1 = Math.round(
      cfg.feminineMinHz + (cfg.feminineMaxHz - cfg.feminineMinHz) * 0.29
    );
    const femStep2 = Math.round(
      cfg.feminineMinHz + (cfg.feminineMaxHz - cfg.feminineMinHz) * 0.57
    );
    const mascStep1 = Math.round(
      cfg.masculineMinHz + (cfg.androgynousMinHz - cfg.masculineMinHz) * 0.38
    );
    const mascStep2 = Math.round(
      cfg.masculineMinHz + (cfg.androgynousMinHz - cfg.masculineMinHz) * 0.69
    );
    const highMid = Math.round((cfg.feminineMaxHz + maxHz) * 0.48);

    const priorityTicks = isCompact
      ? [
          cfg.feminineMinHz,
          cfg.androgynousMinHz,
          cfg.feminineMaxHz,
          cfg.masculineMinHz,
          femStep2,
          mascStep1,
          minHz,
          maxHz,
        ]
      : [
          cfg.feminineMinHz,
          cfg.androgynousMinHz,
          cfg.feminineMaxHz,
          cfg.masculineMinHz,
          androMid,
          femStep1,
          femStep2,
          mascStep1,
          mascStep2,
          minHz,
          highMid,
          maxHz,
        ];

    const minPixelGap = isCompact ? 17 : 15;
    const acceptedTicks: number[] = [];
    for (const freq of priorityTicks) {
      if (freq < minHz || freq > maxHz) continue;
      const y = hzToY(freq);
      if (acceptedTicks.every((existing) => Math.abs(hzToY(existing) - y) >= minPixelGap)) {
        acceptedTicks.push(freq);
      }
    }
    const refFrequencies = acceptedTicks.sort((a, b) => a - b);

    ctx.font = isCompact
      ? '500 10px system-ui, sans-serif'
      : '500 11px system-ui, sans-serif';

    for (const freq of refFrequencies) {
      const y = hzToY(freq);

      const isPrimaryZoneBorder =
        freq === cfg.feminineMinHz || freq === cfg.androgynousMinHz;
      const isOuterCorridorBorder =
        freq === cfg.feminineMaxHz || freq === cfg.masculineMinHz;

      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.strokeStyle = isPrimaryZoneBorder
        ? 'rgba(226, 232, 240, 0.32)'
        : isOuterCorridorBorder
          ? 'rgba(148, 163, 184, 0.22)'
          : 'rgba(148, 163, 184, 0.11)';
      ctx.lineWidth = isPrimaryZoneBorder ? 1.3 : 1;
      ctx.setLineDash(
        isPrimaryZoneBorder ? [4, 4] : isOuterCorridorBorder ? [2, 4] : []
      );
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isPrimaryZoneBorder
        ? '#f8fafc'
        : isOuterCorridorBorder
          ? '#cbd5e1'
          : '#94a3b8';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${freq} Hz`, padLeft - 6, y);

      const note = hzToNoteInfo(freq);
      ctx.fillStyle = isPrimaryZoneBorder ? '#e2e8f0' : '#64748b';
      ctx.textAlign = 'left';
      ctx.fillText(note.noteName, padLeft + plotW + 6, y);
    }

    // 3. Draw Zone Watermark Labels inside Plot
    if (!isCompact) {
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      if (femTop - highTop > 16) {
        ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
        ctx.font = '500 10px system-ui, sans-serif';
        ctx.fillText(
          `OBERER RAND (${cfg.feminineMaxHz}–${maxHz} Hz · komprimiert)`,
          padLeft + 10,
          highTop + 5
        );
      }

      ctx.font = '600 11px system-ui, sans-serif';
      if (femBot - femTop > 20) {
        ctx.fillStyle = 'rgba(244, 114, 182, 0.85)';
        ctx.fillText(
          `FEMININ (${cfg.feminineMinHz}–${cfg.feminineMaxHz} Hz)`,
          padLeft + 10,
          femTop + 6
        );
      }
      if (androBot - androTop > 14) {
        ctx.fillStyle = 'rgba(192, 132, 252, 0.9)';
        ctx.fillText(
          `ANDROGYN (${cfg.androgynousMinHz}–${cfg.feminineMinHz} Hz)`,
          padLeft + 10,
          androTop + 6
        );
      }
      if (mascBot - mascTop > 20) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.fillText(
          `MASKULIN (${cfg.masculineMinHz}–${cfg.androgynousMinHz} Hz)`,
          padLeft + 10,
          mascBot - 18
        );
      }
    }

    // 4. Draw Personal Target Corridor (Dashed Emerald Highlight)
    const targetTop = hzToY(cfg.targetMaxHz);
    const targetBot = hzToY(cfg.targetMinHz);
    if (cfg.showTargetCorridor !== false && targetBot > targetTop) {
      ctx.fillStyle = 'rgba(52, 211, 153, 0.07)';
      ctx.fillRect(padLeft, targetTop, plotW, targetBot - targetTop);

      ctx.strokeStyle = 'rgba(52, 211, 153, 0.65)';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, targetTop);
      ctx.lineTo(padLeft + plotW, targetTop);
      ctx.moveTo(padLeft, targetBot);
      ctx.lineTo(padLeft + plotW, targetBot);
      ctx.stroke();
      ctx.setLineDash([]);

      if (!isCompact) {
        ctx.fillStyle = '#34d399';
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(
          `Zielkorridor (${cfg.targetMinHz}–${cfg.targetMaxHz} Hz)`,
          padLeft + plotW - 8,
          targetTop + 10
        );
      }
    }

    // 5. Group Voiced Samples into Smooth Connected Phrase Curves
    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();

    const strokeGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    const femBoundaryRatio = Math.max(0, Math.min(1, (femBot - padTop) / plotH));
    const androBoundaryRatio = Math.max(0, Math.min(1, (androBot - padTop) / plotH));
    strokeGrad.addColorStop(0, '#f472b6');
    strokeGrad.addColorStop(Math.max(0, femBoundaryRatio - 0.02), '#f472b6');
    strokeGrad.addColorStop(Math.min(1, femBoundaryRatio + 0.02), '#c084fc');
    strokeGrad.addColorStop(Math.max(0, androBoundaryRatio - 0.02), '#c084fc');
    strokeGrad.addColorStop(Math.min(1, androBoundaryRatio + 0.02), '#38bdf8');
    strokeGrad.addColorStop(1, '#38bdf8');

    const glowGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    glowGrad.addColorStop(0, 'rgba(244, 114, 182, 0.28)');
    glowGrad.addColorStop(femBoundaryRatio, 'rgba(192, 132, 252, 0.25)');
    glowGrad.addColorStop(1, 'rgba(56, 189, 248, 0.28)');

    const MAX_PHRASE_GAP_MS = 700;
    const segments: PlotPoint[][] = [];
    let currentSegment: PlotPoint[] = [];

    // Find start index quickly instead of scanning thousands of old samples
    const minTimestamp = startTime - 800;
    let startIdx = 0;
    if (!useSmartPause && curSamples.length > 300) {
      startIdx = Math.max(0, curSamples.length - Math.ceil((winSec + 3) * 70));
    }

    for (let i = startIdx; i < curSamples.length; i++) {
      const s = curSamples[i];
      const t = useSmartPause ? s.speakingTimeMs : s.timestamp;
      if (t < minTimestamp) continue;

      if (s.hz === null || s.zone === 'out_of_range') {
        continue;
      }

      const xRatio = (t - startTime) / totalSpanMs;
      const x = padLeft + xRatio * plotW;
      const y = hzToY(s.hz);

      const prevPt =
        currentSegment.length > 0 ? currentSegment[currentSegment.length - 1] : null;

      if (prevPt && s.timestamp - prevPt.timestamp > MAX_PHRASE_GAP_MS) {
        segments.push(currentSegment);
        currentSegment = [];
      }

      currentSegment.push({
        x,
        y,
        hz: s.hz,
        timestamp: s.timestamp,
        zone: s.zone,
      });
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    if (segments.length > 0) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      for (const seg of segments) {
        traceSmoothSpline(ctx, seg);
      }
      ctx.strokeStyle = glowGrad;
      ctx.lineWidth = isCompact ? 6 : 8;
      ctx.stroke();

      ctx.beginPath();
      for (const seg of segments) {
        traceSmoothSpline(ctx, seg);
      }
      ctx.strokeStyle = strokeGrad;
      ctx.lineWidth = isCompact ? 2.8 : 3.6;
      ctx.stroke();
    } else if (!listening && curSamples.length === 0) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = isCompact
        ? '500 12px system-ui, sans-serif'
        : '500 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        isCompact
          ? 'Warte auf Spracheingabe…'
          : 'Starte das Mikrofon oder den Demo-Modus – deine Stimmfrequenz läuft hier in Echtzeit durch',
        padLeft + plotW / 2,
        padTop + plotH / 2
      );
    }

    ctx.restore();

    // 6. Draw Live Playhead & Cursor on the Right Edge
    if (playProg === null && listening) {
      const liveX = padLeft + plotW;
      const lastSeg = segments.length > 0 ? segments[segments.length - 1] : null;
      const lastVoicedPt =
        lastSeg && lastSeg.length > 0 ? lastSeg[lastSeg.length - 1] : null;
      const isCurrentlyVoiced =
        (curSample && curSample.hz !== null) ||
        (lastVoicedPt && nowMs - lastVoicedPt.timestamp < 180);

      ctx.beginPath();
      ctx.moveTo(liveX - 1, padTop);
      ctx.lineTo(liveX - 1, padTop + plotH);
      ctx.strokeStyle = isCurrentlyVoiced
        ? 'rgba(244, 114, 182, 0.5)'
        : 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const activeHz =
        curSample?.hz ?? (isCurrentlyVoiced ? (lastVoicedPt?.hz ?? null) : null);
      const activeZone =
        curSample?.zone ?? (isCurrentlyVoiced ? (lastVoicedPt?.zone ?? null) : null);

      if (activeHz !== null) {
        const liveY = hzToY(activeHz);
        const liveColor = getZoneColor(activeZone);

        ctx.beginPath();
        ctx.arc(liveX - 1, liveY, isCompact ? 7 : 10, 0, Math.PI * 2);
        ctx.fillStyle = `${liveColor}33`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(liveX - 1, liveY, isCompact ? 4 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle = liveColor;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }

    // 7. Draw Playback Cursor if replaying a reading session
    if (playProg !== null && playProg >= 0 && playProg <= 1) {
      const playX = padLeft + playProg * plotW;
      ctx.beginPath();
      ctx.moveTo(playX, padTop);
      ctx.lineTo(playX, padTop + plotH);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Border frame around plot area
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    ctx.restore();
  };

  // Uninterrupted 60fps requestAnimationFrame loop while listening (never torn down on sample updates)
  useEffect(() => {
    if (!isListening || isPaused || playbackProgress !== null) {
      drawFnRef.current();
      return;
    }

    let rafId: number | null = null;
    let active = true;

    const loop = () => {
      if (!active) return;
      drawFnRef.current();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isListening, isPaused, playbackProgress]);

  // Redraw when static props change while paused or stopped
  useEffect(() => {
    if (!isListening || isPaused || playbackProgress !== null) {
      drawFnRef.current();
    }
  }, [samples, currentSample, settings, height, windowSeconds, compact, playbackProgress, isListening, isPaused]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-800 bg-[#0d1322]">
      <canvas
        ref={canvasRef}
        style={{ height: `${height}px` }}
        className="block w-full"
        aria-label="Echtzeit-Frequenzverlauf (Pitch-Graph) mit Bereichen für Feminin, Androgyn und Maskulin"
      />
    </div>
  );
};
