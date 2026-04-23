declare module 'butterchurn' {
  interface ButterchurnVisualizer {
    connectAudio(node: AudioNode): void;
    loadPreset(preset: any, blendTime: number): void;
    setRendererSize(width: number, height: number): void;
    setInternalMeshSize(width: number, height: number): void;
    render(): void;
  }

  interface Butterchurn {
    createVisualizer(
      audioContext: AudioContext,
      canvas: HTMLCanvasElement,
      options: { width: number; height: number; pixelRatio?: number }
    ): ButterchurnVisualizer;
    isSupported(): boolean;
  }

  const butterchurn: Butterchurn;
  export default butterchurn;
}

declare module 'butterchurn-presets' {
  interface ButterchurnPresets {
    getPresets(): Record<string, any>;
  }

  const butterchurnPresets: ButterchurnPresets;
  export default butterchurnPresets;
}
