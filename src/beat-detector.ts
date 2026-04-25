/**
 * Beat detection via energy flux.
 * Compares current frame's total energy to a rolling average.
 * When the ratio exceeds a threshold, fires the onBeat callback.
 */

export class BeatDetector {
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private energyHistory: number[] = [];
  private historySize = 45; // ~0.75s at 60fps
  private threshold = 1.8; // current/average ratio to trigger
  private cooldownFrames = 180; // ~3s at 60fps — minimum between triggers
  private framesSinceLastBeat = 0;
  private enabled = true;

  onBeat?: () => void;

  attach(analyser: AnalyserNode): void {
    this.analyser = analyser;
    this.freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    this.energyHistory = [];
    this.framesSinceLastBeat = this.cooldownFrames; // allow immediate first beat
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setThreshold(threshold: number): void {
    this.threshold = Math.max(1.2, Math.min(4.0, threshold));
  }

  setCooldown(seconds: number): void {
    this.cooldownFrames = Math.round(seconds * 60);
  }

  /** Call once per frame. Analyzes energy and fires onBeat when appropriate. */
  update(): void {
    if (!this.enabled || !this.analyser || !this.freqData) return;

    this.analyser.getByteFrequencyData(this.freqData);

    // Calculate total energy (sum of all frequency bins)
    let energy = 0;
    for (let i = 0; i < this.freqData.length; i++) {
      energy += this.freqData[i];
    }
    energy /= this.freqData.length * 255; // normalize to 0-1

    // Track history
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.historySize) {
      this.energyHistory.shift();
    }

    this.framesSinceLastBeat++;

    // Need enough history to compare
    if (this.energyHistory.length < 10) return;

    // Calculate average energy
    const avg = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;

    // Beat detected when current energy significantly exceeds average
    if (avg > 0.01 && energy / avg > this.threshold && this.framesSinceLastBeat >= this.cooldownFrames) {
      this.framesSinceLastBeat = 0;
      this.onBeat?.();
    }
  }
}
