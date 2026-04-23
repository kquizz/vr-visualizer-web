/**
 * VR controller input — button + thumbstick combos.
 *
 * Quest controller buttons:
 *   - buttons[0]: trigger
 *   - buttons[1]: grip/squeeze
 *   - buttons[3]: thumbstick press
 *   - buttons[4]: A (right) / X (left)
 *   - buttons[5]: B (right) / Y (left)
 *
 * Control scheme (all use LEFT thumbstick for the analog input):
 *
 *   No button held:
 *     Left stick left/right → prev/next preset (edge-triggered)
 *     Left trigger → random preset
 *
 *   Hold A (right):
 *     Left stick up/down → zoom
 *     Left stick left/right → rotation speed
 *
 *   Hold B (right):
 *     Left stick up/down → warp intensity
 *     Left stick left/right → decay (trail length)
 *
 *   Hold X (left):
 *     Left stick up/down → wave green
 *     Left stick left/right → wave red↔blue
 *
 *   Hold Y (left):
 *     Left stick up/down → gamma/brightness
 *     Left stick left/right → wave scale
 *
 *   Right trigger → reset all overrides
 */

import { dbg } from './debug';

export interface VRControlState {
  // Preset navigation
  nextPreset: boolean;
  prevPreset: boolean;
  randomPreset: boolean;
  resetParams: boolean;
  togglePassthrough: boolean;

  // Which mode is active
  mode: 'navigate' | 'zoom-rot' | 'warp-decay' | 'color' | 'gamma-scale';

  // Analog values from left stick (-1 to 1)
  stickX: number;
  stickY: number;
}

export class VRControls {
  private session: XRSession | null = null;
  private prevStickX = 0;
  private prevLeftTrigger = false;
  private prevRightTrigger = false;
  private prevLeftStickPress = false;

  attach(session: XRSession): void {
    this.session = session;
    dbg('[Controls] Attached — A/B/X/Y + left stick for params, stick flick for presets');
  }

  poll(): VRControlState {
    const state: VRControlState = {
      nextPreset: false,
      prevPreset: false,
      randomPreset: false,
      resetParams: false,
      togglePassthrough: false,
      mode: 'navigate',
      stickX: 0,
      stickY: 0,
    };

    if (!this.session) return state;

    // Button states
    let aHeld = false;  // right A
    let bHeld = false;  // right B
    let xHeld = false;  // left X
    let yHeld = false;  // left Y
    let rightTrigger = false;
    let leftTrigger = false;
    let stickX = 0;
    let stickY = 0;

    for (const source of this.session.inputSources) {
      if (!source.gamepad) continue;
      const axes = source.gamepad.axes;
      const buttons = source.gamepad.buttons;

      if (source.handedness === 'right') {
        aHeld = buttons.length > 4 && buttons[4].pressed;
        bHeld = buttons.length > 5 && buttons[5].pressed;
        rightTrigger = buttons.length > 0 && buttons[0].pressed;
      }

      if (source.handedness === 'left') {
        xHeld = buttons.length > 4 && buttons[4].pressed;
        yHeld = buttons.length > 5 && buttons[5].pressed;
        leftTrigger = buttons.length > 0 && buttons[0].pressed;
        stickX = axes.length > 2 ? axes[2] : 0;
        stickY = axes.length > 3 ? axes[3] : 0;

        // Left stick press → toggle passthrough (edge-triggered)
        const stickPress = buttons.length > 3 && buttons[3].pressed;
        if (stickPress && !this.prevLeftStickPress) state.togglePassthrough = true;
        this.prevLeftStickPress = stickPress;
      }
    }

    state.stickX = stickX;
    state.stickY = stickY;

    // Determine mode based on held button
    if (aHeld) {
      state.mode = 'zoom-rot';
    } else if (bHeld) {
      state.mode = 'warp-decay';
    } else if (xHeld) {
      state.mode = 'color';
    } else if (yHeld) {
      state.mode = 'gamma-scale';
    } else {
      state.mode = 'navigate';

      // Preset switching — edge-triggered on left stick X (only in navigate mode)
      if (stickX > 0.7 && this.prevStickX <= 0.7) state.nextPreset = true;
      if (stickX < -0.7 && this.prevStickX >= -0.7) state.prevPreset = true;
    }
    this.prevStickX = stickX;

    // Left trigger → random preset (edge-triggered)
    if (leftTrigger && !this.prevLeftTrigger) state.randomPreset = true;
    this.prevLeftTrigger = leftTrigger;

    // Right trigger → reset (edge-triggered)
    if (rightTrigger && !this.prevRightTrigger) state.resetParams = true;
    this.prevRightTrigger = rightTrigger;

    return state;
  }
}
