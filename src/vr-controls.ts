/**
 * VR controller input handling for Quest controllers.
 *
 * Quest controller layout (per hand):
 *   - Thumbstick: axes[2] (x), axes[3] (y)
 *   - Trigger: buttons[0]
 *   - Grip/Squeeze: buttons[1]
 *   - A/X button: buttons[4]
 *   - B/Y button: buttons[5]
 *   - Thumbstick press: buttons[3]
 *
 * Mapping:
 *   - Right thumbstick left/right: prev/next preset
 *   - Right trigger: random preset
 *   - Left thumbstick up/down: zoom override
 *   - Left thumbstick left/right: rotation speed override
 *   - Left trigger: reset overrides
 */

import { dbg } from './debug';

export interface VRControlState {
  // Preset navigation
  nextPreset: boolean;
  prevPreset: boolean;
  randomPreset: boolean;

  // Parameter overrides (-1 to 1 range)
  zoomDelta: number;    // left stick Y
  rotDelta: number;     // left stick X
  resetParams: boolean; // left trigger
}

export class VRControls {
  private session: XRSession | null = null;
  private prevThumbRight = 0; // for edge detection on preset switching
  private prevTriggerRight = false;
  private prevTriggerLeft = false;

  attach(session: XRSession): void {
    this.session = session;
    dbg('[Controls] Attached to XR session');
  }

  /** Poll controllers and return current state. Call once per frame. */
  poll(): VRControlState {
    const state: VRControlState = {
      nextPreset: false,
      prevPreset: false,
      randomPreset: false,
      zoomDelta: 0,
      rotDelta: 0,
      resetParams: false,
    };

    if (!this.session) return state;

    for (const source of this.session.inputSources) {
      if (!source.gamepad) continue;

      const axes = source.gamepad.axes;
      const buttons = source.gamepad.buttons;

      if (source.handedness === 'right') {
        // Right thumbstick X for preset switching (edge-triggered)
        const thumbX = axes.length > 2 ? axes[2] : 0;
        if (thumbX > 0.7 && this.prevThumbRight <= 0.7) {
          state.nextPreset = true;
        } else if (thumbX < -0.7 && this.prevThumbRight >= -0.7) {
          state.prevPreset = true;
        }
        this.prevThumbRight = thumbX;

        // Right trigger for random preset (edge-triggered)
        const triggerPressed = buttons.length > 0 && buttons[0].pressed;
        if (triggerPressed && !this.prevTriggerRight) {
          state.randomPreset = true;
        }
        this.prevTriggerRight = triggerPressed;
      }

      if (source.handedness === 'left') {
        // Left thumbstick for zoom/rotation (continuous)
        state.zoomDelta = axes.length > 3 ? axes[3] : 0;  // Y axis
        state.rotDelta = axes.length > 2 ? axes[2] : 0;    // X axis

        // Left trigger to reset
        const triggerPressed = buttons.length > 0 && buttons[0].pressed;
        if (triggerPressed && !this.prevTriggerLeft) {
          state.resetParams = true;
        }
        this.prevTriggerLeft = triggerPressed;
      }
    }

    return state;
  }
}
