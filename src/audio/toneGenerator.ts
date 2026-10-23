export type ReferenceToneTimbre = 'warm' | 'sine' | 'vocal';

export class ReferenceTonePlayer {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private currentHz = 196;

  public start(hz: number, timbre: ReferenceToneTimbre = 'warm', volume = 0.22): void {
    this.stop();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    this.currentHz = hz;

    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(Math.max(0.01, Math.min(0.6, volume)), now + 0.08);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(timbre === 'vocal' ? 2100 : 1100, now);
    filter.Q.setValueAtTime(timbre === 'vocal' ? 3.2 : 0.9, now);

    const osc1 = this.ctx.createOscillator();
    osc1.type = timbre === 'sine' ? 'sine' : timbre === 'warm' ? 'triangle' : 'sawtooth';
    osc1.frequency.setValueAtTime(hz, now);

    osc1.connect(filter);

    if (timbre === 'vocal') {
      const osc2 = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(hz * 2, now);
      subGain.gain.setValueAtTime(0.28, now);
      osc2.connect(subGain);
      subGain.connect(filter);
      osc2.start(now);
      this.osc2 = osc2;
    }

    filter.connect(masterGain);
    masterGain.connect(this.ctx.destination);

    osc1.start(now);
    this.osc1 = osc1;
    this.gainNode = masterGain;
    this.isPlaying = true;
  }

  public setFrequency(hz: number): void {
    this.currentHz = hz;
    if (!this.ctx || !this.isPlaying) return;
    const now = this.ctx.currentTime;
    if (this.osc1) {
      this.osc1.frequency.setTargetAtTime(hz, now, 0.03);
    }
    if (this.osc2) {
      this.osc2.frequency.setTargetAtTime(hz * 2, now, 0.03);
    }
  }

  public stop(): void {
    if (!this.isPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      if (this.gainNode) {
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(Math.max(0.001, this.gainNode.gain.value), now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      }
      const o1 = this.osc1;
      const o2 = this.osc2;
      setTimeout(() => {
        try {
          o1?.stop();
          o1?.disconnect();
          o2?.stop();
          o2?.disconnect();
        } catch {
          // Ignore already stopped oscillators
        }
      }, 75);
    } catch {
      // Ignore cleanup errors
    }
    this.osc1 = null;
    this.osc2 = null;
    this.gainNode = null;
    this.isPlaying = false;
  }

  public get active(): boolean {
    return this.isPlaying;
  }

  public get frequency(): number {
    return this.currentHz;
  }

  /**
   * Plays a gentle, non-intrusive 380ms two-note ascending chime ending on targetHz
   * as an optional audio reminder when the voice drops below the target corridor.
   */
  public playGentleAlertChime(targetHz: number): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      const now = this.ctx.currentTime;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(Math.max(120, targetHz * 0.84), now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(140, targetHz), now + 0.16);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.44);
    } catch {
      // Ignore if AudioContext is blocked
    }
  }
}

export const referenceTonePlayer = new ReferenceTonePlayer();
