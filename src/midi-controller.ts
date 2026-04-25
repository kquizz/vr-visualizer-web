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
