import { AudioEngine } from './audio';
import { MilkdropVisualizer } from './visualizer';
import { VRRenderer } from './vr';
import { PresetBrowser } from './preset-browser';
import { dbg, enableDebug } from './debug';
import { BeatDetector } from './beat-detector';
import { TouchControls } from './touch-controls';

// Enable debug overlay with ?debug in URL
if (window.location.search.includes('debug')) {
  enableDebug();
  dbg('Debug mode enabled');
}

// --- Seizure warning ---
const warningEl = document.getElementById('seizure-warning') as HTMLDivElement;
const btnAccept = document.getElementById('btn-accept-warning') as HTMLButtonElement;

if (!localStorage.getItem('seizure-warning-accepted')) {
  warningEl.style.display = 'flex';
  btnAccept.addEventListener('click', () => {
    localStorage.setItem('seizure-warning-accepted', '1');
    warningEl.style.display = 'none';
  });
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
const btnBrowse = document.getElementById('btn-browse') as HTMLButtonElement;

// Core modules
const audio = new AudioEngine();
const milkdrop = new MilkdropVisualizer(milkdropCanvas);
const presetBrowser = new PresetBrowser(milkdrop);
const beatDetector = new BeatDetector();

// Mobile touch controls
const touch = new TouchControls();
touch.attach(milkdropCanvas);
touch.onSwipeLeft = () => { milkdrop.nextPreset(); presetBrowser.updateActiveHighlight(); };
touch.onSwipeRight = () => { milkdrop.prevPreset(); presetBrowser.updateActiveHighlight(); };
touch.onSwipeUp = () => presetBrowser.show();
touch.onSwipeDown = () => presetBrowser.hide();
touch.onDoubleTap = () => { milkdrop.randomPreset(); presetBrowser.updateActiveHighlight(); };
touch.onTap = () => {
  const controls = document.getElementById('controls')!;
  controls.style.opacity = controls.style.opacity === '0' ? '1' : '0';
};

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

  // Beat detection frame loop (separate from Milkdrop's render loop)
  function beatLoop() {
    beatDetector.update();
    requestAnimationFrame(beatLoop);
  }
  beatLoop();

  // Enable preset controls
  btnPrev.disabled = false;
  btnNext.disabled = false;

  // Auto-cycle presets
  if (presetTimer) clearInterval(presetTimer);
  presetTimer = setInterval(() => milkdrop.randomPreset(), PRESET_CYCLE_SECONDS * 1000);

  // Hide status
  statusEl.classList.add('hidden');

  // Populate preset browser now that presets are loaded
  presetBrowser.populate();

  // Beat detection — auto-switch presets on energy spikes
  if (audio.analyser) {
    beatDetector.attach(audio.analyser);
    beatDetector.onBeat = () => {
      milkdrop.randomPreset();
      presetBrowser.updateActiveHighlight();
    };
  }

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
btnPrev.addEventListener('click', () => { milkdrop.prevPreset(); presetBrowser.updateActiveHighlight(); });
btnNext.addEventListener('click', () => { milkdrop.nextPreset(); presetBrowser.updateActiveHighlight(); });
btnBrowse.addEventListener('click', () => {
  // Load preset list even without audio — just can't hear anything
  if (milkdrop.presetNames.length === 0) {
    milkdrop.initPresetList();
    presetBrowser.populate();
  }
  presetBrowser.toggle();
});

const btnBeat = document.getElementById('btn-beat') as HTMLButtonElement;
btnBeat.addEventListener('click', () => {
  beatDetector.setEnabled(!beatDetector.isEnabled());
  btnBeat.classList.toggle('active', beatDetector.isEnabled());
});

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
    case 'b':
      presetBrowser.toggle();
      break;
    case 'f':
      milkdrop.toggleFavorite(milkdrop.currentPresetName);
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
        vr = new VRRenderer(threeCanvas, milkdrop, audio, beatDetector);
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

// --- Browser compatibility checks ---

const isFirefox = navigator.userAgent.includes('Firefox');
if (!navigator.mediaDevices?.getDisplayMedia) {
  btnTab.disabled = true;
  btnTab.title = 'Tab capture not supported in this browser';
} else if (isFirefox) {
  btnTab.disabled = true;
  btnTab.title = 'Firefox does not support tab audio capture — use Chrome or Edge';
  btnTab.textContent = 'Tab Audio (Chrome only)';
}
