/**
 * Three.js + WebXR setup.
 * - Milkdrop snapshot canvas mapped onto inverted sphere
 * - Audio-reactive sphere pulsing to bass
 * - Passthrough mode (Quest 3) with additive blending
 * - VR controller input for presets, params, and mode toggles
 */

import * as THREE from 'three';
import { dbg } from './debug';
import type { MilkdropVisualizer } from './visualizer';
import type { AudioEngine } from './audio';
import { VRControls } from './vr-controls';

const BASE_RADIUS = 200;
const PULSE_AMOUNT = 40; // max radius change from bass

export class VRRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private texture: THREE.CanvasTexture;
  private sphere: THREE.Mesh;
  private sphereMaterial: THREE.MeshBasicMaterial;
  private threeCanvas: HTMLCanvasElement;
  private frameCount = 0;
  private milkdrop: MilkdropVisualizer;
  private audio: AudioEngine;
  private controls: VRControls;
  private freqData: any;
  private passthrough = false;

  constructor(threeCanvas: HTMLCanvasElement, milkdrop: MilkdropVisualizer, audio: AudioEngine) {
    this.threeCanvas = threeCanvas;
    this.milkdrop = milkdrop;
    this.audio = audio;
    this.controls = new VRControls();
    const snapshotCanvas = milkdrop.snapshotCanvas;

    // Pre-allocate frequency data buffer
    this.freqData = new Uint8Array(64);

    dbg(`[VR] Constructor — snapshot: ${snapshotCanvas.width}x${snapshotCanvas.height}`);

    // Renderer — alpha:true needed for passthrough
    this.renderer = new THREE.WebGLRenderer({
      canvas: threeCanvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 0);

    // Texture from the 2D snapshot canvas
    this.texture = new THREE.CanvasTexture(snapshotCanvas);
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.texture.generateMipmaps = true;

    // Inverted sphere
    const geometry = new THREE.SphereGeometry(BASE_RADIUS, 128, 64);
    geometry.scale(-1, 1, 1);

    this.sphereMaterial = new THREE.MeshBasicMaterial({ map: this.texture });
    this.sphere = new THREE.Mesh(geometry, this.sphereMaterial);
    this.sphere.rotation.y = Math.PI / 2; // seam behind user
    this.scene.add(this.sphere);

    window.addEventListener('resize', () => this.onResize());
    dbg('[VR] Scene ready');
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Get bass energy (0-1) from the analyser */
  private getBassEnergy(): number {
    if (!this.audio.analyser) return 0;
    this.audio.analyser.getByteFrequencyData(this.freqData);
    // Average the first 8 bins (~0-350Hz depending on FFT size)
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += this.freqData[i];
    return sum / (8 * 255);
  }

  togglePassthrough(): void {
    this.passthrough = !this.passthrough;
    if (this.passthrough) {
      // Additive blend — bright Milkdrop colors show, dark parts disappear
      this.sphereMaterial.blending = THREE.AdditiveBlending;
      this.sphereMaterial.opacity = 0.85;
      this.sphereMaterial.transparent = true;
      this.scene.background = null; // let passthrough show through
      dbg('[VR] Passthrough ON — additive blend');
    } else {
      this.sphereMaterial.blending = THREE.NormalBlending;
      this.sphereMaterial.opacity = 1.0;
      this.sphereMaterial.transparent = false;
      this.scene.background = new THREE.Color(0x000000);
      dbg('[VR] Passthrough OFF — normal');
    }
    this.sphereMaterial.needsUpdate = true;
  }

  async enterVR(): Promise<void> {
    dbg('[VR] Requesting XR session...');
    const session = await navigator.xr!.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'passthrough'],
      // @ts-expect-error — not yet in all TS type defs
      environmentBlendMode: 'alpha-blend',
    });
    dbg('[VR] Got XR session');
    this.controls.attach(session);
    this.renderer.xr.setSession(session);
    this.threeCanvas.style.display = 'block';
    dbg('[VR] Session active');
  }

  render(): void {
    const input = this.controls.poll();
    const o = this.milkdrop.overrides;

    // Preset navigation
    if (input.nextPreset) this.milkdrop.nextPreset();
    if (input.prevPreset) this.milkdrop.prevPreset();
    if (input.randomPreset) this.milkdrop.randomPreset();

    // Passthrough toggle
    if (input.togglePassthrough) this.togglePassthrough();

    // Apply thumbstick based on active mode
    const scale = 0.01;
    switch (input.mode) {
      case 'zoom-rot':
        o.zoomDelta = input.stickY * 0.02;
        o.rotDelta = input.stickX * 0.05;
        break;
      case 'warp-decay':
        o.warpOffset += input.stickY * scale * 2;
        o.decayOffset += input.stickX * scale * 0.1;
        break;
      case 'color':
        o.waveROffset += input.stickX * scale;
        o.waveBOffset -= input.stickX * scale;
        o.waveGOffset += input.stickY * scale;
        break;
      case 'gamma-scale':
        o.gammaOffset += input.stickY * scale * 2;
        o.waveScaleOffset += input.stickX * scale * 2;
        break;
      case 'navigate':
        o.zoomDelta = 0;
        o.rotDelta = 0;
        break;
    }

    if (input.resetParams) {
      this.milkdrop.resetOverrides();
      dbg('[Controls] All params reset');
    }

    // Drive Butterchurn
    this.milkdrop.renderFrame();

    // Audio-reactive sphere pulse
    const bass = this.getBassEnergy();
    const pulseRadius = BASE_RADIUS + bass * PULSE_AMOUNT;
    const currentScale = pulseRadius / BASE_RADIUS;
    this.sphere.scale.setScalar(currentScale);

    this.texture.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);

    this.frameCount++;
    if (this.frameCount <= 5 || this.frameCount % 300 === 0) {
      dbg(`[VR] frame ${this.frameCount} | bass:${bass.toFixed(2)}`);
    }
  }

  start(): void {
    dbg('[VR] Starting render loop');
    this.renderer.setAnimationLoop(() => {
      this.render();
    });
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }
}
