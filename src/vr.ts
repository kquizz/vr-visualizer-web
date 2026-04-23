/**
 * Three.js + WebXR setup.
 * Reads from the MilkdropVisualizer's snapshot canvas (a 2D canvas
 * that gets updated immediately after each Butterchurn render).
 * Maps it onto an inverted sphere surrounding the VR camera.
 */

import * as THREE from 'three';
import { dbg } from './debug';
import type { MilkdropVisualizer } from './visualizer';

export class VRRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private texture: THREE.CanvasTexture;
  private sphere: THREE.Mesh;
  private threeCanvas: HTMLCanvasElement;
  private frameCount = 0;
  private milkdrop: MilkdropVisualizer;

  constructor(threeCanvas: HTMLCanvasElement, milkdrop: MilkdropVisualizer) {
    this.threeCanvas = threeCanvas;
    this.milkdrop = milkdrop;
    const snapshotCanvas = milkdrop.snapshotCanvas;

    dbg(`[VR] Constructor — snapshot canvas: ${snapshotCanvas.width}x${snapshotCanvas.height}`);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: threeCanvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 0);

    // Texture from the 2D snapshot canvas (already copied from Butterchurn)
    this.texture = new THREE.CanvasTexture(snapshotCanvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Inverted sphere — user looks at the inside
    const geometry = new THREE.SphereGeometry(50, 64, 32);
    geometry.scale(-1, 1, 1); // flip normals inward
    const material = new THREE.MeshBasicMaterial({ map: this.texture });
    this.sphere = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphere);

    window.addEventListener('resize', () => this.onResize());
    dbg('[VR] Scene ready — sphere + texture created');
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  async enterVR(): Promise<void> {
    dbg('[VR] Requesting XR session...');
    const session = await navigator.xr!.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    });
    dbg('[VR] Got XR session');
    this.renderer.xr.setSession(session);
    this.threeCanvas.style.display = 'block';
    dbg('[VR] Session active');
  }

  /** Call each frame — drives Butterchurn + updates texture from snapshot */
  render(): void {
    // Drive Butterchurn from the XR loop since requestAnimationFrame
    // is paused when the browser enters immersive VR mode
    this.milkdrop.renderFrame();

    this.texture.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);

    this.frameCount++;
    if (this.frameCount <= 5 || this.frameCount % 300 === 0) {
      dbg(`[VR] frame ${this.frameCount} | snapshot ${this.milkdrop.snapshotCanvas.width}x${this.milkdrop.snapshotCanvas.height}`);
    }
  }

  /** Start the Three.js render loop (uses XR-aware setAnimationLoop) */
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
