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
    return this.ctx;
  }

  private setupAnalyser(ctx: AudioContext): AnalyserNode {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    analyser.connect(ctx.destination);
    this.analyser = analyser;
    return analyser;
  }

  /** Clean up previous source without destroying the context */
  private disconnectSource(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
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
    const analyser = this.setupAnalyser(ctx);

    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    this.audioElement = audio;

    const source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
    this.sourceNode = source;

    await audio.play();
  }

  /**
   * Capture audio from another browser tab via getDisplayMedia.
   * The user picks which tab to share — we only take the audio track.
   */
  async connectTabCapture(): Promise<void> {
    this.disconnectSource();
    const ctx = this.ensureContext();
    const analyser = this.setupAnalyser(ctx);

    // preferCurrentTab: false lets user pick ANY tab
    // systemAudio: 'include' requests system audio on supported browsers
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // required by spec, but we ignore the video track
      audio: {
        suppressLocalAudioPlayback: false,
      } as any,
    });

    this.stream = stream;

    // Check we actually got an audio track
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach(t => t.stop());
      throw new Error('No audio track — this only works with browser tabs (not desktop apps). Pick a Chrome tab and check "Share tab audio"');
    }

    // Create a stream with only the audio track
    const audioStream = new MediaStream(audioTracks);
    const source = ctx.createMediaStreamSource(audioStream);
    source.connect(analyser);
    // Don't connect to destination — the tab's audio already plays in the browser
    analyser.disconnect();
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
    const analyser = this.setupAnalyser(ctx);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.stream = stream;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    // Don't connect analyser to destination — avoids feedback loop
    analyser.disconnect();
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
