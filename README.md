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
