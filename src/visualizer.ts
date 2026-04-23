/**
 * Butterchurn Milkdrop visualizer wrapper.
 * Renders presets to a canvas, can be used standalone (flat screen)
 * or as a texture source for Three.js (VR mode).
 */

import butterchurn from 'butterchurn';
import butterchurnPresets from 'butterchurn-presets';

export class MilkdropVisualizer {
  private visualizer: any = null;
  private canvas: HTMLCanvasElement;
  private presetNames: string[] = [];
  private presetMap: Record<string, any> = {};
  private currentIndex = 0;
  private animFrameId = 0;
  private running = false;

  onPresetChange?: (name: string) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  get currentPresetName(): string {
    return this.presetNames[this.currentIndex] ?? '(none)';
  }

  get presetCount(): number {
    return this.presetNames.length;
  }

  init(audioContext: AudioContext, audioNode: AudioNode): void {
    const width = this.canvas.clientWidth || 1280;
    const height = this.canvas.clientHeight || 720;

    this.canvas.width = width;
    this.canvas.height = height;

    this.visualizer = butterchurn.createVisualizer(audioContext, this.canvas, {
      width,
      height,
      pixelRatio: window.devicePixelRatio || 1,
    });

    this.visualizer.connectAudio(audioNode);

    // Load presets
    this.presetMap = butterchurnPresets.getPresets();
    this.presetNames = Object.keys(this.presetMap).sort();

    // Start with a random preset
    this.currentIndex = Math.floor(Math.random() * this.presetNames.length);
    this.loadCurrentPreset(0);
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

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.visualizer) {
      this.visualizer.setRendererSize(width, height);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      if (this.visualizer) {
        this.visualizer.render();
      }
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
