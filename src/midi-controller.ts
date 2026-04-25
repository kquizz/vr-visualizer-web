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

/** Human-readable param names for MIDI learn UI */
export const PARAM_LABELS: Record<string, string> = {
  zoomDelta: 'Zoom',
  rotDelta: 'Rotation',
  warpOffset: 'Warp',
  decayOffset: 'Trail Decay',
  waveROffset: 'Red Color',
  waveGOffset: 'Green Color',
  waveBOffset: 'Blue Color',
  gammaOffset: 'Brightness',
  waveScaleOffset: 'Wave Scale',
};

/** All assignable params */
export const ASSIGNABLE_PARAMS = Object.keys(PARAM_LABELS);

/** Default min/max ranges per param */
const PARAM_RANGES: Record<string, [number, number]> = {
  zoomDelta: [-0.05, 0.05],
  rotDelta: [-0.1, 0.1],
  warpOffset: [-0.5, 0.5],
  decayOffset: [-0.05, 0.05],
  waveROffset: [-0.5, 0.5],
  waveGOffset: [-0.5, 0.5],
  waveBOffset: [-0.5, 0.5],
  gammaOffset: [-1.0, 1.0],
  waveScaleOffset: [-1.0, 1.0],
};

export class MidiController {
  private access: MIDIAccess | null = null;
  private mappings: MidiMapping[] = [...DEFAULT_MAPPINGS];
  private connected = false;
  private learning = false;
  private learnParam: string | null = null;

  onCC?: (param: string, value: number) => void;
  onNoteOn?: () => void;
  onConnectionChange?: (connected: boolean, deviceName: string) => void;
  onLearnComplete?: (cc: number, param: string) => void;

  static isSupported(): boolean {
    return 'requestMIDIAccess' in navigator;
  }

  async connect(): Promise<void> {
    if (!MidiController.isSupported()) {
      throw new Error('Web MIDI not supported in this browser');
    }

    this.access = await navigator.requestMIDIAccess();
    dbg(`[MIDI] Access granted, ${this.access.inputs.size} input(s) found`);

    for (const input of this.access.inputs.values()) {
      this.attachInput(input);
    }

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
        const cc = data[1];

        // MIDI learn mode — assign this CC to the selected param
        if (this.learning && this.learnParam) {
          const range = PARAM_RANGES[this.learnParam] ?? [-0.5, 0.5];
          this.setMapping(cc, this.learnParam, range[0], range[1]);
          dbg(`[MIDI] Learned: CC ${cc} → ${PARAM_LABELS[this.learnParam] ?? this.learnParam}`);
          this.onLearnComplete?.(cc, this.learnParam);
          this.learning = false;
          this.learnParam = null;
          this.saveMappings();
          return;
        }

        const mapping = this.mappings.find(m => m.cc === cc);
        if (mapping) {
          const normalized = mapping.min + (value / 127) * (mapping.max - mapping.min);
          this.onCC?.(mapping.param, normalized);
        }
      } else if (status === 0x90 && value > 0) {
        this.onNoteOn?.();
      }
    };
  }

  /** Start MIDI learn — next CC message will be mapped to this param */
  startLearn(param: string): void {
    this.learning = true;
    this.learnParam = param;
    dbg(`[MIDI] Learn mode: turn a knob to assign it to ${PARAM_LABELS[param] ?? param}`);
  }

  cancelLearn(): void {
    this.learning = false;
    this.learnParam = null;
  }

  isLearning(): boolean {
    return this.learning;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getMappings(): MidiMapping[] {
    return [...this.mappings];
  }

  /** Get the CC number currently assigned to a param, or null */
  getCCForParam(param: string): number | null {
    const m = this.mappings.find(mp => mp.param === param);
    return m ? m.cc : null;
  }

  setMapping(cc: number, param: string, min: number, max: number): void {
    // Remove any existing mapping for this param (one knob per param)
    this.mappings = this.mappings.filter(m => m.param !== param);
    // Remove any existing mapping for this CC (one param per knob)
    this.mappings = this.mappings.filter(m => m.cc !== cc);
    this.mappings.push({ cc, param, min, max });
  }

  private saveMappings(): void {
    try {
      localStorage.setItem('midi-mappings', JSON.stringify(this.mappings));
    } catch { /* ignore */ }
  }

  loadMappings(): void {
    try {
      const saved = localStorage.getItem('midi-mappings');
      if (saved) this.mappings = JSON.parse(saved);
    } catch { /* ignore */ }
  }

  resetMappings(): void {
    this.mappings = [...DEFAULT_MAPPINGS];
    localStorage.removeItem('midi-mappings');
  }
}
