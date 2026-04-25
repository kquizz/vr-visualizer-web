# VR Visualizer Feature Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add beat detection preset cycling, mobile touch support, Web MIDI controller mapping, README/landing page, and preset playlist sharing to the browser-based VR Milkdrop visualizer.

**Architecture:** Five independent features added to the existing Butterchurn + Three.js + WebXR app. Each feature is a new module wired into `main.ts`. Beat detection analyzes FFT energy deltas to trigger preset changes. Mobile touch uses pointer events. Web MIDI uses the browser MIDI API to map CC messages to existing ParamOverrides. Preset playlists encode favorites as base64 URL params. README documents the project.

**Tech Stack:** TypeScript, Vite, Butterchurn, Three.js, Web Audio API, Web MIDI API, Vercel

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/beat-detector.ts` | **CREATE** — Energy spike detection from AnalyserNode, fires callbacks on beats |
| `src/touch-controls.ts` | **CREATE** — Mobile touch/swipe handlers for preset nav and param control |
| `src/midi-controller.ts` | **CREATE** — Web MIDI input, maps CC numbers to ParamOverrides |
| `src/playlist.ts` | **CREATE** — Encode/decode favorites to/from URL params, import/export |
| `src/main.ts` | **MODIFY** — Wire in beat detector, touch controls, MIDI, playlist URL parsing |
| `src/visualizer.ts` | **MODIFY** — Add `getFavoriteNames()` helper for playlist export |
| `src/preset-browser.ts` | **MODIFY** — Add playlist share/import buttons, MIDI status indicator |
| `index.html` | **MODIFY** — Add touch meta viewport, MIDI button, share button |
| `README.md` | **CREATE** — Project description, screenshot, controls reference, deploy instructions |

---

## Task 1: Beat Detection Preset Cycling

**Files:**
- Create: `src/beat-detector.ts`
- Modify: `src/main.ts`

### What this does
Monitors FFT energy over time. When a sharp energy increase is detected (like a drop or transition), it fires a callback. Wired to `milkdrop.randomPreset()` with a cooldown to avoid rapid switching.

- [ ] **Step 1: Create `src/beat-detector.ts`**

```typescript
/**
 * Beat detection via energy flux.
 * Compares current frame's total energy to a rolling average.
 * When the ratio exceeds a threshold, fires the onBeat callback.
 */

export class BeatDetector {
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;
  private energyHistory: number[] = [];
  private historySize = 45; // ~0.75s at 60fps
  private threshold = 1.8; // current/average ratio to trigger
  private cooldownFrames = 180; // ~3s at 60fps — minimum between triggers
  private framesSinceLastBeat = 0;
  private enabled = true;

  onBeat?: () => void;

  attach(analyser: AnalyserNode): void {
    this.analyser = analyser;
    this.freqData = new Uint8Array(analyser.frequencyBinCount);
    this.energyHistory = [];
    this.framesSinceLastBeat = this.cooldownFrames; // allow immediate first beat
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setThreshold(threshold: number): void {
    this.threshold = Math.max(1.2, Math.min(4.0, threshold));
  }

  setCooldown(seconds: number): void {
    this.cooldownFrames = Math.round(seconds * 60);
  }

  /** Call once per frame. Analyzes energy and fires onBeat when appropriate. */
  update(): void {
    if (!this.enabled || !this.analyser || !this.freqData) return;

    this.analyser.getByteFrequencyData(this.freqData);

    // Calculate total energy (sum of all frequency bins)
    let energy = 0;
    for (let i = 0; i < this.freqData.length; i++) {
      energy += this.freqData[i];
    }
    energy /= this.freqData.length * 255; // normalize to 0-1

    // Track history
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.historySize) {
      this.energyHistory.shift();
    }

    this.framesSinceLastBeat++;

    // Need enough history to compare
    if (this.energyHistory.length < 10) return;

    // Calculate average energy
    const avg = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;

    // Beat detected when current energy significantly exceeds average
    if (avg > 0.01 && energy / avg > this.threshold && this.framesSinceLastBeat >= this.cooldownFrames) {
      this.framesSinceLastBeat = 0;
      this.onBeat?.();
    }
  }
}
```

- [ ] **Step 2: Wire beat detector into `main.ts`**

Add import at the top of `src/main.ts` (after existing imports):

```typescript
import { BeatDetector } from './beat-detector';
```

Add after the `const presetBrowser = ...` line:

```typescript
const beatDetector = new BeatDetector();
```

In the `startVisualization()` function, after `presetBrowser.populate();`, add:

```typescript
  // Beat detection — auto-switch presets on energy spikes
  if (audio.analyser) {
    beatDetector.attach(audio.analyser);
    beatDetector.onBeat = () => {
      milkdrop.randomPreset();
      presetBrowser.updateActiveHighlight();
    };
  }
```

In the Milkdrop render loop inside `startVisualization()`, the `start()` call already exists. The beat detector needs to be updated each frame. Modify the section after `milkdrop.start();` — add a separate frame loop for beat detection on flat screen:

```typescript
  // Beat detection frame loop (separate from Milkdrop's render loop)
  function beatLoop() {
    beatDetector.update();
    requestAnimationFrame(beatLoop);
  }
  beatLoop();
```

Also add beat detection to the VR render path. In the VR `render()` method in `src/vr.ts`, add after the controls polling section (before `this.milkdrop.renderFrame()`):

In `src/vr.ts`, add a `beatDetector` field and pass it through:

Modify the `VRRenderer` constructor signature in `src/vr.ts`:

```typescript
constructor(threeCanvas: HTMLCanvasElement, milkdrop: MilkdropVisualizer, audio: AudioEngine, beatDetector: BeatDetector) {
```

Store it:
```typescript
    this.beatDetector = beatDetector;
```

Add field declaration:
```typescript
  private beatDetector: BeatDetector;
```

Add import:
```typescript
import type { BeatDetector } from './beat-detector';
```

In the `render()` method, add before `this.milkdrop.renderFrame();`:
```typescript
    this.beatDetector.update();
```

Update the constructor call in `main.ts`:
```typescript
        vr = new VRRenderer(threeCanvas, milkdrop, audio, beatDetector);
```

- [ ] **Step 3: Add beat detection toggle to controls**

In `index.html`, add a button after the Browse button:

```html
      <button id="btn-beat" title="Auto-switch presets on beat drops">Beat Sync</button>
```

In `main.ts`, add after the `btnBrowse` declaration:

```typescript
const btnBeat = document.getElementById('btn-beat') as HTMLButtonElement;
```

Add the click handler after the other button handlers:

```typescript
btnBeat.addEventListener('click', () => {
  beatDetector.setEnabled(!beatDetector.isEnabled());
  btnBeat.classList.toggle('active', beatDetector.isEnabled());
});
```

Add a getter to `BeatDetector`:

```typescript
  isEnabled(): boolean {
    return this.enabled;
  }
```

Add CSS for active state in `index.html` (in the `<style>` block):

```css
    button.active { background: rgba(100, 140, 255, 0.3); border-color: rgba(100, 140, 255, 0.5); }
```

- [ ] **Step 4: Build and verify**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
npm run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
git add src/beat-detector.ts src/main.ts src/vr.ts index.html
git commit -m "feat: beat detection auto-cycles presets on energy spikes

Monitors FFT energy flux, triggers preset change when current energy
exceeds rolling average by 1.8x. 3-second cooldown between triggers.
Toggle via Beat Sync button on flat screen."
```

---

## Task 2: Mobile Touch Controls

**Files:**
- Create: `src/touch-controls.ts`
- Modify: `src/main.ts`
- Modify: `index.html`

### What this does
Swipe left/right for preset navigation, tap to show/hide controls, pinch (future) for zoom. Makes the visualizer usable on phones with mic input.

- [ ] **Step 1: Add viewport meta tag to `index.html`**

In the `<head>` section, the viewport meta already exists. Verify it includes `user-scalable=no` to prevent zoom conflicts:

```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
```

- [ ] **Step 2: Create `src/touch-controls.ts`**

```typescript
/**
 * Touch/swipe controls for mobile.
 * - Swipe left/right: next/prev preset
 * - Swipe up: open preset browser
 * - Swipe down: close preset browser
 * - Tap: toggle control bar visibility
 * - Double-tap: random preset
 */

export class TouchControls {
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private lastTap = 0;

  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onTap?: () => void;
  onDoubleTap?: () => void;

  attach(element: HTMLElement): void {
    element.addEventListener('touchstart', (e) => this.handleStart(e), { passive: true });
    element.addEventListener('touchend', (e) => this.handleEnd(e), { passive: true });
  }

  private handleStart(e: TouchEvent): void {
    const touch = e.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.startTime = Date.now();
  }

  private handleEnd(e: TouchEvent): void {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;
    const dt = Date.now() - this.startTime;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Tap detection (short duration, minimal movement)
    if (dt < 300 && distance < 20) {
      const now = Date.now();
      if (now - this.lastTap < 350) {
        this.onDoubleTap?.();
        this.lastTap = 0; // reset to prevent triple-tap
      } else {
        this.lastTap = now;
        // Delay tap to allow double-tap detection
        setTimeout(() => {
          if (this.lastTap !== 0 && Date.now() - this.lastTap >= 300) {
            this.onTap?.();
          }
        }, 350);
      }
      return;
    }

    // Swipe detection (minimum 60px, within 500ms)
    if (dt > 500 || distance < 60) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal swipe
      if (dx > 0) this.onSwipeRight?.();
      else this.onSwipeLeft?.();
    } else {
      // Vertical swipe
      if (dy > 0) this.onSwipeDown?.();
      else this.onSwipeUp?.();
    }
  }
}
```

- [ ] **Step 3: Wire touch controls into `main.ts`**

Add import:

```typescript
import { TouchControls } from './touch-controls';
```

Add after the `beatDetector` declaration:

```typescript
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
```

Add CSS for controls fade in `index.html`:

```css
    #controls { transition: opacity 0.3s; }
```

- [ ] **Step 4: Build and verify**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
npm run build
```

Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
git add src/touch-controls.ts src/main.ts index.html
git commit -m "feat: mobile touch controls — swipe, tap, double-tap

Swipe left/right for presets, swipe up/down for browser panel,
double-tap for random, tap to toggle control bar. Passive touch
events for smooth scrolling."
```

---

## Task 3: Web MIDI Controller Support

**Files:**
- Create: `src/midi-controller.ts`
- Modify: `src/main.ts`
- Modify: `index.html`

### What this does
Connects to any class-compliant USB MIDI controller (DJ decks, MIDI keyboards, pad controllers). Maps CC (Control Change) messages to Milkdrop parameter overrides. Default mapping targets common Pioneer DDJ knobs but any CC can be remapped.

- [ ] **Step 1: Create `src/midi-controller.ts`**

```typescript
/**
 * Web MIDI controller input.
 * Listens for CC messages and maps them to Milkdrop parameter callbacks.
 * Default mapping for common DJ controllers (Pioneer DDJ series):
 *   CC 1 → zoom, CC 2 → rotation, CC 3 → warp, CC 4 → decay
 *   CC 5 → wave red, CC 6 → wave green, CC 7 → wave blue
 *   CC 8 → gamma
 * Note messages: any note-on → next preset
 */

import { dbg } from './debug';

export interface MidiMapping {
  cc: number;
  param: string;
  min: number;
  max: number;
}

const DEFAULT_MAPPINGS: MidiMapping[] = [
  { cc: 1, param: 'zoomDelta', min: -0.05, max: 0.05 },
  { cc: 2, param: 'rotDelta', min: -0.1, max: 0.1 },
  { cc: 3, param: 'warpOffset', min: -0.5, max: 0.5 },
  { cc: 4, param: 'decayOffset', min: -0.05, max: 0.05 },
  { cc: 5, param: 'waveROffset', min: -0.5, max: 0.5 },
  { cc: 6, param: 'waveGOffset', min: -0.5, max: 0.5 },
  { cc: 7, param: 'waveBOffset', min: -0.5, max: 0.5 },
  { cc: 8, param: 'gammaOffset', min: -1.0, max: 1.0 },
];

export class MidiController {
  private access: MIDIAccess | null = null;
  private mappings: MidiMapping[] = DEFAULT_MAPPINGS;
  private connected = false;

  onCC?: (param: string, value: number) => void;
  onNoteOn?: () => void;
  onConnectionChange?: (connected: boolean, deviceName: string) => void;

  static isSupported(): boolean {
    return 'requestMIDIAccess' in navigator;
  }

  async connect(): Promise<void> {
    if (!MidiController.isSupported()) {
      throw new Error('Web MIDI not supported in this browser');
    }

    this.access = await navigator.requestMIDIAccess();
    dbg(`[MIDI] Access granted, ${this.access.inputs.size} input(s) found`);

    // Listen on all inputs
    for (const input of this.access.inputs.values()) {
      this.attachInput(input);
    }

    // Handle hot-plug
    this.access.onstatechange = (e: MIDIConnectionEvent) => {
      const port = e.port;
      if (port && port.type === 'input') {
        if (port.state === 'connected') {
          this.attachInput(port as MIDIInput);
          dbg(`[MIDI] Device connected: ${port.name}`);
          this.connected = true;
          this.onConnectionChange?.(true, port.name ?? 'Unknown');
        } else {
          dbg(`[MIDI] Device disconnected: ${port.name}`);
          this.connected = false;
          this.onConnectionChange?.(false, port.name ?? 'Unknown');
        }
      }
    };

    if (this.access.inputs.size > 0) {
      const firstName = this.access.inputs.values().next().value?.name ?? 'Unknown';
      this.connected = true;
      this.onConnectionChange?.(true, firstName);
    }
  }

  private attachInput(input: MIDIInput): void {
    input.onmidimessage = (msg: MIDIMessageEvent) => {
      const data = msg.data;
      if (!data || data.length < 3) return;

      const status = data[0] & 0xf0;
      const value = data[2];

      if (status === 0xb0) {
        // Control Change
        const cc = data[1];
        const mapping = this.mappings.find(m => m.cc === cc);
        if (mapping) {
          // Map 0-127 to min-max range
          const normalized = mapping.min + (value / 127) * (mapping.max - mapping.min);
          this.onCC?.(mapping.param, normalized);
        }
      } else if (status === 0x90 && value > 0) {
        // Note On
        this.onNoteOn?.();
      }
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  getMappings(): MidiMapping[] {
    return [...this.mappings];
  }

  setMapping(cc: number, param: string, min: number, max: number): void {
    const existing = this.mappings.find(m => m.cc === cc);
    if (existing) {
      existing.param = param;
      existing.min = min;
      existing.max = max;
    } else {
      this.mappings.push({ cc, param, min, max });
    }
  }
}
```

- [ ] **Step 2: Add MIDI button to `index.html`**

Add after the Beat Sync button in the controls div:

```html
      <button id="btn-midi" style="display:none" title="Connect MIDI controller">MIDI</button>
```

- [ ] **Step 3: Wire MIDI into `main.ts`**

Add import:

```typescript
import { MidiController } from './midi-controller';
```

Add after the touch controls setup:

```typescript
// MIDI controller
const btnMidi = document.getElementById('btn-midi') as HTMLButtonElement;
let midi: MidiController | null = null;

if (MidiController.isSupported()) {
  btnMidi.style.display = 'block';
  btnMidi.addEventListener('click', async () => {
    if (midi) return; // already connected
    midi = new MidiController();
    midi.onCC = (param, value) => {
      (milkdrop.overrides as any)[param] = value;
    };
    midi.onNoteOn = () => {
      milkdrop.randomPreset();
      presetBrowser.updateActiveHighlight();
    };
    midi.onConnectionChange = (connected, name) => {
      btnMidi.classList.toggle('active', connected);
      btnMidi.title = connected ? `Connected: ${name}` : 'Connect MIDI controller';
    };
    try {
      await midi.connect();
    } catch (err) {
      statusEl.textContent = `MIDI error: ${err}`;
      statusEl.classList.remove('hidden');
    }
  });
}
```

- [ ] **Step 4: Build and verify**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
npm run build
```

Expected: Clean build. MIDI button only visible in browsers with Web MIDI support.

- [ ] **Step 5: Commit**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
git add src/midi-controller.ts src/main.ts index.html
git commit -m "feat: Web MIDI controller support for DJ decks

Maps CC messages to Milkdrop param overrides (zoom, rotation, warp,
decay, colors, gamma). Note-on triggers random preset. Auto-detects
hot-plug. Default mapping targets Pioneer DDJ but works with any
class-compliant USB MIDI device."
```

---

## Task 4: Shareable Preset Playlists

**Files:**
- Create: `src/playlist.ts`
- Modify: `src/visualizer.ts`
- Modify: `src/preset-browser.ts`
- Modify: `src/main.ts`
- Modify: `index.html`

### What this does
Encodes your favorite presets as a URL parameter so you can share a link like `vr-visualizer-web.vercel.app?presets=abc123` and the recipient gets your curated preset list.

- [ ] **Step 1: Create `src/playlist.ts`**

```typescript
/**
 * Encode/decode preset favorites as shareable URL parameters.
 * Uses indices into the sorted preset list, base64-encoded for compact URLs.
 */

export function encodePlaylist(presetNames: string[], favorites: Set<string>): string {
  const indices: number[] = [];
  for (const name of favorites) {
    const idx = presetNames.indexOf(name);
    if (idx >= 0) indices.push(idx);
  }
  indices.sort((a, b) => a - b);
  // Encode as comma-separated indices, then base64
  const raw = indices.join(',');
  return btoa(raw);
}

export function decodePlaylist(presetNames: string[], encoded: string): string[] {
  try {
    const raw = atob(encoded);
    const indices = raw.split(',').map(Number).filter(n => !isNaN(n) && n >= 0 && n < presetNames.length);
    return indices.map(i => presetNames[i]);
  } catch {
    return [];
  }
}

export function getPlaylistFromURL(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('presets');
}

export function buildShareURL(presetNames: string[], favorites: Set<string>): string {
  const encoded = encodePlaylist(presetNames, favorites);
  const url = new URL(window.location.href);
  url.searchParams.set('presets', encoded);
  // Remove debug param if present
  url.searchParams.delete('debug');
  return url.toString();
}
```

- [ ] **Step 2: Add `getFavoriteNames()` to `src/visualizer.ts`**

Add after the `isFavorite()` method:

```typescript
  getFavoriteNames(): string[] {
    return this.presetNames.filter(n => this.favorites.has(n));
  }
```

- [ ] **Step 3: Add share button to `index.html`**

Add after the MIDI button in the controls div:

```html
      <button id="btn-share" title="Copy share link with your favorites">Share</button>
```

- [ ] **Step 4: Add share/import to preset browser panel in `src/preset-browser.ts`**

Add import at top of file:

```typescript
import { buildShareURL, decodePlaylist, getPlaylistFromURL } from './playlist';
```

In the constructor, after the close button creation, add a share button to the header:

```typescript
    const shareBtn = document.createElement('button');
    shareBtn.id = 'pb-share';
    shareBtn.title = 'Copy share link';
    shareBtn.textContent = '\u{1F517}'; // 🔗
    shareBtn.addEventListener('click', () => {
      if (this.milkdrop.favorites.size === 0) {
        shareBtn.textContent = 'No favs!';
        setTimeout(() => { shareBtn.textContent = '\u{1F517}'; }, 2000);
        return;
      }
      const url = buildShareURL(this.milkdrop.presetNames, this.milkdrop.favorites);
      navigator.clipboard.writeText(url).then(() => {
        shareBtn.textContent = 'Copied!';
        setTimeout(() => { shareBtn.textContent = '\u{1F517}'; }, 2000);
      });
    });
    header.appendChild(shareBtn);
```

Add a method to import a playlist:

```typescript
  importPlaylist(names: string[]): void {
    for (const name of names) {
      if (!this.milkdrop.isFavorite(name)) {
        this.milkdrop.toggleFavorite(name);
      }
    }
    // Re-render stars
    for (const [name, item] of this.items) {
      const star = item.querySelector('.pb-star');
      if (star) star.classList.toggle('fav', this.milkdrop.isFavorite(name));
    }
    this.updateStats();
  }
```

- [ ] **Step 5: Wire playlist URL parsing into `main.ts`**

Add import:

```typescript
import { getPlaylistFromURL, decodePlaylist, buildShareURL } from './playlist';
```

Add after the `presetBrowser` declaration:

```typescript
// Share button
const btnShare = document.getElementById('btn-share') as HTMLButtonElement;
btnShare.addEventListener('click', () => {
  if (milkdrop.favorites.size === 0) {
    statusEl.textContent = 'Favorite some presets first, then share!';
    statusEl.classList.remove('hidden');
    setTimeout(() => statusEl.classList.add('hidden'), 3000);
    return;
  }
  milkdrop.initPresetList(); // ensure loaded
  const url = buildShareURL(milkdrop.presetNames, milkdrop.favorites);
  navigator.clipboard.writeText(url).then(() => {
    btnShare.textContent = 'Copied!';
    setTimeout(() => { btnShare.textContent = 'Share'; }, 2000);
  });
});
```

In `startVisualization()`, after `presetBrowser.populate()`, add:

```typescript
  // Import shared playlist from URL if present
  const playlistParam = getPlaylistFromURL();
  if (playlistParam) {
    const names = decodePlaylist(milkdrop.presetNames, playlistParam);
    if (names.length > 0) {
      presetBrowser.importPlaylist(names);
      milkdrop.useFavorites = true;
      statusEl.textContent = `Imported ${names.length} presets from shared link!`;
      statusEl.classList.remove('hidden');
      setTimeout(() => statusEl.classList.add('hidden'), 3000);
    }
  }
```

- [ ] **Step 6: Build and verify**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
npm run build
```

Expected: Clean build.

- [ ] **Step 7: Commit**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
git add src/playlist.ts src/visualizer.ts src/preset-browser.ts src/main.ts index.html
git commit -m "feat: shareable preset playlists via URL

Favorites encoded as base64 preset indices in ?presets= URL param.
Share button copies link to clipboard. Opening a shared link auto-imports
favorites and enables favorites-only mode. Share button also in
preset browser panel header."
```

---

## Task 5: README and Landing Page Polish

**Files:**
- Create: `README.md`
- Modify: `index.html`

### What this does
Documents the project for GitHub visitors and adds a subtle title/description to the landing page so new users know what they're looking at.

- [ ] **Step 1: Create `README.md`**

```markdown
# VR Visualizer Web

Browser-based Milkdrop music visualizer with VR support. Open a URL, play music, see visuals. No installs, no drivers.

**Live:** [vr-visualizer-web.vercel.app](https://vr-visualizer-web.vercel.app)

## Features

- **Milkdrop presets** — hundreds of classic presets via [Butterchurn](https://github.com/jberg/butterchurn)
- **VR support** — WebXR on Quest browser, no app install needed
- **Multiple audio sources** — local files, browser tab capture (Chrome), microphone
- **Beat detection** — auto-switches presets on drops and transitions
- **Preset browser** — search, hover to preview, star favorites
- **VR controller mapping** — Quest thumbstick + button combos for real-time parameter control
- **Audio-reactive** — sphere pulses to bass
- **Passthrough mode** — Quest 3 mixed reality overlay
- **MIDI support** — map DJ controller knobs to Milkdrop parameters
- **Shareable playlists** — send friends a link with your favorite presets
- **Mobile friendly** — swipe controls, works with phone mic

## Audio Sources

| Source | How | Best for |
|--------|-----|----------|
| **Browser Tab** | Click "Capture Browser Tab", pick a tab playing music, check "Share tab audio" | Streaming (Spotify web, YouTube, Tidal web, SoundCloud) |
| **Audio File** | Click "Open Audio File" or drag-and-drop an MP3/FLAC/WAV | Local music library |
| **Microphone** | Click "Use Microphone" | Room audio, speakers playing nearby |

> **Note:** Tab audio capture only works in Chrome/Edge (not Firefox). It captures browser tabs only, not desktop apps.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` / `→` | Next preset |
| `P` / `←` | Previous preset |
| `R` | Random preset |
| `B` | Toggle preset browser |
| `F` | Favorite current preset |

## VR Controls (Quest)

| Hold | Left Stick ↕ | Left Stick ↔ |
|------|-------------|-------------|
| Nothing | — | Prev/next preset |
| **A** | Zoom | Rotation |
| **B** | Warp | Decay (trails) |
| **X** | Green | Red ↔ Blue |
| **Y** | Brightness | Wave scale |

- **Left trigger** → random preset
- **Right trigger** → reset overrides
- **Left stick press** → toggle passthrough

## Tech Stack

- [Butterchurn](https://github.com/jberg/butterchurn) — WebGL Milkdrop renderer
- [Three.js](https://threejs.org/) — 3D rendering + WebXR
- [Vite](https://vitejs.dev/) — build tool
- [Vercel](https://vercel.com/) — hosting

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build in dist/
```

## Deploy

```bash
npm run build
vercel deploy --prod
```

## License

MIT
```

- [ ] **Step 2: Add subtle branding to `index.html`**

Add after the `#preset-name` div:

```html
    <div id="branding" style="
      position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%);
      z-index: 5; font-size: 11px; opacity: 0.25; pointer-events: none;
      letter-spacing: 2px; text-transform: uppercase;
    ">VR Visualizer</div>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
git add README.md index.html
git commit -m "docs: README with features, controls, and dev instructions

Covers audio sources, keyboard shortcuts, VR controls, tech stack,
and deployment. Subtle branding added to landing page."
```

---

## Task 6: Final Build, Deploy, and Verify

**Files:** None (deployment step)

- [ ] **Step 1: Full build**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 2: Test locally**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
npx vite preview
```

Open http://localhost:4173 in browser. Verify:
- Seizure warning shows on first visit (use incognito)
- Browse button works without audio
- Start audio via file or tab capture
- Beat Sync button toggles
- MIDI button visible in Chrome
- Share button copies URL
- Preset browser search, favorites, hover preview all work
- Keyboard shortcuts work (n, p, r, b, f)

- [ ] **Step 3: Deploy to Vercel**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
vercel deploy --prod --yes
```

- [ ] **Step 4: Push all changes**

```bash
cd /Users/kquillen/Code/games/vr-visualizer-web
git push
```
