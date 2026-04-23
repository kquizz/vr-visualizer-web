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
  zoomDelta: number;  // added to preset's zoom each frame
  rotDelta: number;   // added to preset's rot each frame
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
  overrides: ParamOverrides = { zoomDelta: 0, rotDelta: 0 };

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
    const { zoomDelta, rotDelta } = this.overrides;
    if (zoomDelta === 0 && rotDelta === 0) return;

    try {
      // Butterchurn internals: visualizer.renderer.presetEquationRunner.mdVSFrame
      const runner = this.visualizer?.renderer?.presetEquationRunner;
      if (runner?.mdVSFrame) {
        const frame = runner.mdVSFrame;
        if (zoomDelta !== 0 && 'zoom' in frame) {
          frame.zoom += zoomDelta * 0.02; // scale to reasonable range
        }
        if (rotDelta !== 0 && 'rot' in frame) {
          frame.rot += rotDelta * 0.05;
        }
      }
    } catch {
      // Internals changed — silently ignore
    }
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
