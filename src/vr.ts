/**
 * Three.js + WebXR setup.
 * Takes the Butterchurn canvas as a texture and renders it
 * onto a sphere surrounding the VR camera.
 */

import * as THREE from 'three';

export class VRRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private texture: THREE.CanvasTexture;
  private sphere: THREE.Mesh;
  private threeCanvas: HTMLCanvasElement;

  constructor(threeCanvas: HTMLCanvasElement, milkdropCanvas: HTMLCanvasElement) {
    this.threeCanvas = threeCanvas;

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

    // Create texture from Butterchurn canvas
    this.texture = new THREE.CanvasTexture(milkdropCanvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Inverted sphere — user looks at the inside
    const geometry = new THREE.SphereGeometry(50, 64, 32);
    geometry.scale(-1, 1, 1); // flip normals inward
    const material = new THREE.MeshBasicMaterial({ map: this.texture });
    this.sphere = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphere);

    window.addEventListener('resize', () => this.onResize());
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  async checkVRSupport(): Promise<boolean> {
    if (!('xr' in navigator)) return false;
    try {
      return await navigator.xr!.isSessionSupported('immersive-vr');
    } catch {
      return false;
    }
  }

  async enterVR(): Promise<void> {
    const session = await navigator.xr!.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    });
    this.renderer.xr.setSession(session);
    this.threeCanvas.style.display = 'block';
  }

  /** Call each frame — updates the texture from the Butterchurn canvas */
  render(): void {
    this.texture.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  /** Start the Three.js render loop (uses XR-aware setAnimationLoop) */
  start(): void {
    this.renderer.setAnimationLoop(() => {
      this.render();
    });
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }
}
