/**
 * Butterchurn Milkdrop visualizer wrapper.
 * Renders presets to a canvas, can be used standalone (flat screen)
 * or as a texture source for Three.js (VR mode).
 *
 * After each render(), immediately copies output to a 2D snapshot canvas.
 * This avoids the preserveDrawingBuffer problem — WebGL buffers get cleared
 * after compositing, so a later drawImage() would read black pixels.
 */

import butterchurn from 'butterchurn';
import butterchurnPresets from 'butterchurn-presets';
import { dbg } from './debug';

export interface ParamOverrides {
  zoomDelta: number;
  rotDelta: number;
  waveROffset: number;
  waveGOffset: number;
  waveBOffset: number;
  warpOffset: number;
  decayOffset: number;
  gammaOffset: number;
  waveScaleOffset: number;
}

export class MilkdropVisualizer {
  private visualizer: any = null;
  private canvas: HTMLCanvasElement;
  private presetNames: string[] = [];
  private presetMap: Record<string, any> = {};
  private currentIndex = 0;
  private animFrameId = 0;
  private running = false;

  /** 2D snapshot of the latest Butterchurn frame — safe to read any time */
  snapshotCanvas: HTMLCanvasElement;
  private snapshotCtx: CanvasRenderingContext2D;

  /** Runtime parameter overrides applied each frame */
  overrides: ParamOverrides = {
    zoomDelta: 0, rotDelta: 0,
    waveROffset: 0, waveGOffset: 0, waveBOffset: 0,
    warpOffset: 0, decayOffset: 0,
    gammaOffset: 0, waveScaleOffset: 0,
  };

  onPresetChange?: (name: string) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.snapshotCanvas = document.createElement('canvas');
    this.snapshotCtx = this.snapshotCanvas.getContext('2d')!;
  }

  get currentPresetName(): string {
    return this.presetNames[this.currentIndex] ?? '(none)';
  }

  get presetCount(): number {
    return this.presetNames.length;
  }

  init(audioContext: AudioContext, audioNode: AudioNode): void {
    // 3072 balances crispness vs Quest GPU budget (4096 causes frame drops)
    const width = 3072;
    const height = 3072;

    this.canvas.width = width;
    this.canvas.height = height;
    this.snapshotCanvas.width = width;
    this.snapshotCanvas.height = height;

    this.visualizer = butterchurn.createVisualizer(audioContext, this.canvas, {
      width,
      height,
      pixelRatio: 1,
    });

    // Higher mesh = sharper warp distortions (default is ~48x36)
    this.visualizer.setInternalMeshSize(192, 144);

    this.visualizer.connectAudio(audioNode);

    // Load presets
    this.presetMap = butterchurnPresets.getPresets();
    this.presetNames = Object.keys(this.presetMap).sort();

    // Start with a random preset
    this.currentIndex = Math.floor(Math.random() * this.presetNames.length);
    this.loadCurrentPreset(0);

    dbg(`[Milkdrop] init: ${width}x${height}, ${this.presetNames.length} presets`);
  }

  private loadCurrentPreset(blendTime: number): void {
    const name = this.presetNames[this.currentIndex];
    if (name && this.presetMap[name]) {
      this.visualizer.loadPreset(this.presetMap[name], blendTime);
      this.onPresetChange?.(name);
    }
  }

  nextPreset(): void {
    this.currentIndex = (this.currentIndex + 1) % this.presetNames.length;
    this.loadCurrentPreset(2.0);
  }

  prevPreset(): void {
    this.currentIndex = (this.currentIndex - 1 + this.presetNames.length) % this.presetNames.length;
    this.loadCurrentPreset(2.0);
  }

  randomPreset(): void {
    this.currentIndex = Math.floor(Math.random() * this.presetNames.length);
    this.loadCurrentPreset(2.0);
  }

  resize(_width: number, _height: number): void {
    // Keep rendering at fixed high resolution (2048x2048) regardless of window size.
    // The canvas CSS scales to fill the page, but the render buffer stays crisp.
    // Only used for flat-screen display sizing — VR reads from snapshotCanvas.
  }

  /** Apply parameter overrides by reaching into Butterchurn's internal preset state */
  private applyOverrides(): void {
    const o = this.overrides;

    try {
      const runner = this.visualizer?.renderer?.presetEquationRunner;
      if (!runner?.mdVSFrame) return;
      const f = runner.mdVSFrame;

      // Zoom & rotation (direct from thumbstick, per-frame)
      if (o.zoomDelta !== 0 && 'zoom' in f) f.zoom += o.zoomDelta * 0.02;
      if (o.rotDelta !== 0 && 'rot' in f) f.rot += o.rotDelta * 0.05;

      // Wave color (accumulated offsets, clamped 0-1)
      if (o.waveROffset !== 0 && 'wave_r' in f) f.wave_r = Math.max(0, Math.min(1, f.wave_r + o.waveROffset));
      if (o.waveGOffset !== 0 && 'wave_g' in f) f.wave_g = Math.max(0, Math.min(1, f.wave_g + o.waveGOffset));
      if (o.waveBOffset !== 0 && 'wave_b' in f) f.wave_b = Math.max(0, Math.min(1, f.wave_b + o.waveBOffset));

      // Warp intensity (accumulated offset)
      if (o.warpOffset !== 0 && 'warp' in f) f.warp = Math.max(0, f.warp + o.warpOffset);

      // Decay — trail persistence (0.8 = fast fade, 1.0 = infinite trails)
      if (o.decayOffset !== 0 && 'decay' in f) f.decay = Math.max(0.8, Math.min(1.0, f.decay + o.decayOffset));

      // Gamma/brightness
      if (o.gammaOffset !== 0 && 'gammaadj' in f) f.gammaadj = Math.max(0.5, Math.min(4.0, f.gammaadj + o.gammaOffset));

      // Wave scale
      if (o.waveScaleOffset !== 0 && 'wave_scale' in f) f.wave_scale = Math.max(0.1, Math.min(5.0, f.wave_scale + o.waveScaleOffset));
    } catch {
      // Internals changed — silently ignore
    }
  }

  resetOverrides(): void {
    this.overrides = {
      zoomDelta: 0, rotDelta: 0,
      waveROffset: 0, waveGOffset: 0, waveBOffset: 0,
      warpOffset: 0, decayOffset: 0,
      gammaOffset: 0, waveScaleOffset: 0,
    };
  }

  /** Render one frame and snapshot it. Called externally (e.g., from XR loop) or internally. */
  renderFrame(): void {
    if (this.visualizer) {
      this.applyOverrides();
      this.visualizer.render();
      this.snapshotCtx.drawImage(this.canvas, 0, 0);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.renderFrame();
      this.animFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }
}
