import { AudioEngine } from './audio';
import { MilkdropVisualizer } from './visualizer';
import { VRRenderer } from './vr';
import { dbg, enableDebug } from './debug';

// Enable debug overlay with ?debug in URL
if (window.location.search.includes('debug')) {
  enableDebug();
  dbg('Debug mode enabled');
}

// DOM elements
const milkdropCanvas = document.getElementById('milkdrop-canvas') as HTMLCanvasElement;
const threeCanvas = document.getElementById('three-canvas') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const presetNameEl = document.getElementById('preset-name') as HTMLDivElement;
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

const btnFile = document.getElementById('btn-file') as HTMLButtonElement;
const btnTab = document.getElementById('btn-tab') as HTMLButtonElement;
const btnMic = document.getElementById('btn-mic') as HTMLButtonElement;
const btnPrev = document.getElementById('btn-preset-prev') as HTMLButtonElement;
const btnNext = document.getElementById('btn-preset-next') as HTMLButtonElement;
const btnVR = document.getElementById('btn-vr') as HTMLButtonElement;

// Core modules
const audio = new AudioEngine();
const milkdrop = new MilkdropVisualizer(milkdropCanvas);
let vr: VRRenderer | null = null;

// Auto-cycle presets
let presetTimer: ReturnType<typeof setInterval> | null = null;
const PRESET_CYCLE_SECONDS = 30;

// --- Initialization after audio source is connected ---

function startVisualization(): void {
  if (!audio.ctx || !audio.analyser) return;

  milkdrop.init(audio.ctx, audio.analyser);
  milkdrop.onPresetChange = (name) => {
    presetNameEl.textContent = name;
    // Fade out preset name after a few seconds
    presetNameEl.style.opacity = '0.7';
    setTimeout(() => { presetNameEl.style.opacity = '0'; }, 3000);
  };

  milkdrop.resize(window.innerWidth, window.innerHeight);
  milkdrop.start();

  // Enable preset controls
  btnPrev.disabled = false;
  btnNext.disabled = false;

  // Auto-cycle presets
  if (presetTimer) clearInterval(presetTimer);
  presetTimer = setInterval(() => milkdrop.randomPreset(), PRESET_CYCLE_SECONDS * 1000);

  // Hide status
  statusEl.classList.add('hidden');

  dbg(`Visualizer started: ${milkdrop.presetCount} presets, canvas ${milkdropCanvas.width}x${milkdropCanvas.height}`);
}

// --- Audio source handlers ---

async function handleFile(file: File): Promise<void> {
  statusEl.textContent = `Loading ${file.name}...`;
  statusEl.classList.remove('hidden');
  try {
    await audio.connectFile(file);
    startVisualization();
  } catch (err) {
    statusEl.textContent = `Error: ${err}`;
  }
}

async function handleTabCapture(): Promise<void> {
  statusEl.textContent = 'Choose a tab to capture audio from...';
  statusEl.classList.remove('hidden');
  try {
    await audio.connectTabCapture();
    startVisualization();
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      statusEl.textContent = 'Tab capture cancelled';
    } else {
      statusEl.textContent = `Error: ${err.message}`;
    }
  }
}

async function handleMicrophone(): Promise<void> {
  statusEl.textContent = 'Requesting microphone access...';
  statusEl.classList.remove('hidden');
  try {
    await audio.connectMicrophone();
    startVisualization();
  } catch (err: any) {
    statusEl.textContent = `Microphone error: ${err.message}`;
  }
}

// --- Button handlers ---

btnFile.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});

btnTab.addEventListener('click', () => handleTabCapture());
btnMic.addEventListener('click', () => handleMicrophone());
btnPrev.addEventListener('click', () => milkdrop.prevPreset());
btnNext.addEventListener('click', () => milkdrop.nextPreset());

// --- Drag & drop ---

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropZone.classList.add('active');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('active');
});
dropZone.addEventListener('dragover', (e) => e.preventDefault());
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('active');
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith('audio/')) {
    handleFile(file);
  }
});

// --- Keyboard shortcuts ---

document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowRight':
    case 'n':
      milkdrop.nextPreset();
      break;
    case 'ArrowLeft':
    case 'p':
      milkdrop.prevPreset();
      break;
    case 'r':
      milkdrop.randomPreset();
      break;
  }
});

// --- Resize ---

window.addEventListener('resize', () => {
  milkdrop.resize(window.innerWidth, window.innerHeight);
});

// --- VR setup ---
// Don't create the Three.js WebGL context until VR is actually requested,
// otherwise it can kill Butterchurn's WebGL context (browser limits active contexts)

async function initVR(): Promise<void> {
  dbg('[VR] initVR called');
  dbg(`[VR] navigator.xr exists: ${'xr' in navigator}`);

  if (!('xr' in navigator)) {
    dbg('[VR] No WebXR support — skipping VR setup');
    return;
  }

  try {
    const supported = await navigator.xr!.isSessionSupported('immersive-vr');
    dbg(`[VR] immersive-vr supported: ${supported}`);
    if (!supported) {
      dbg('[VR] VR not supported — button stays hidden');
      return;
    }
  } catch (err) {
    dbg(`[VR] ERROR checking VR support: ${err}`);
    return;
  }

  dbg('[VR] Showing Enter VR button');
  btnVR.style.display = 'block';
  btnVR.addEventListener('click', async () => {
    dbg('[VR] Enter VR clicked');
    try {
      if (!vr) {
        dbg('[VR] Creating VRRenderer...');
        vr = new VRRenderer(threeCanvas, milkdrop);
        dbg('[VR] VRRenderer created');
      }
      dbg('[VR] Requesting VR session...');
      await vr.enterVR();
      dbg('[VR] VR session started, starting render loop');
      vr.start();
      dbg('[VR] Render loop running');
    } catch (err) {
      dbg(`[VR] ERROR entering VR: ${err}`);
      statusEl.textContent = `VR Error: ${err}`;
      statusEl.classList.remove('hidden');
    }
  });
}

initVR();

// --- Tab capture support check ---

if (!navigator.mediaDevices?.getDisplayMedia) {
  btnTab.disabled = true;
  btnTab.title = 'Tab capture not supported in this browser';
}
