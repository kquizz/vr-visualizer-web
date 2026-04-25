/**
 * Audio capture and analysis via Web Audio API.
 * Supports: local files, tab/screen capture (getDisplayMedia), microphone.
 */

export type AudioSourceType = 'file' | 'tab' | 'mic';

export class AudioEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  sourceNode: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null;
  audioElement: HTMLAudioElement | null = null;
  private stream: MediaStream | null = null;

  get isActive(): boolean {
    return this.analyser !== null && this.ctx?.state === 'running';
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    // Resume if suspended (browsers require user gesture)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private createAnalyser(ctx: AudioContext): AnalyserNode {
    // Just create the analyser — don't connect it to destination yet.
    // Callers decide whether to route through to speakers.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    this.analyser = analyser;
    return analyser;
  }

  /** Clean up previous source without destroying the context */
  private disconnectSource(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
  }

  /** Load a local audio file (MP3, FLAC, WAV, OGG, etc.) */
  async connectFile(file: File): Promise<void> {
    this.disconnectSource();
    const ctx = this.ensureContext();
    const analyser = this.createAnalyser(ctx);

    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    this.audioElement = audio;

    const source = ctx.createMediaElementSource(audio);
    // source → analyser → speakers (we need to hear the file)
    source.connect(analyser);
    analyser.connect(ctx.destination);
    this.sourceNode = source;

    await audio.play();
  }

  /**
   * Capture audio from a browser tab via getDisplayMedia.
   * Only works with Chrome tabs (not windows/screens/apps).
   * Firefox does not support audio capture via getDisplayMedia.
   */
  async connectTabCapture(): Promise<void> {
    this.disconnectSource();
    const ctx = this.ensureContext();
    const analyser = this.createAnalyser(ctx);

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // required by spec
      audio: {
        suppressLocalAudioPlayback: false,
      } as any,
    });

    this.stream = stream;

    // Check we actually got an audio track
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach(t => t.stop());
      throw new Error(
        'No audio track received. This only works when sharing a Chrome tab ' +
        '(not a window or screen). Make sure to check "Share tab audio" in the dialog.'
      );
    }

    // source → analyser (no destination — tab audio already plays in the browser)
    const audioStream = new MediaStream(audioTracks);
    const source = ctx.createMediaStreamSource(audioStream);
    source.connect(analyser);
    this.sourceNode = source;

    // Stop visualizing if user stops sharing
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      this.disconnectSource();
    });
  }

  /** Capture microphone input */
  async connectMicrophone(): Promise<void> {
    this.disconnectSource();
    const ctx = this.ensureContext();
    const analyser = this.createAnalyser(ctx);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.stream = stream;

    // source → analyser (no destination — avoids feedback loop)
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    this.sourceNode = source;
  }

  destroy(): void {
    this.disconnectSource();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.analyser = null;
  }
}
