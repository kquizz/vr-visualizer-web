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
        this.lastTap = 0;
      } else {
        this.lastTap = now;
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
      if (dx > 0) this.onSwipeRight?.();
      else this.onSwipeLeft?.();
    } else {
      if (dy > 0) this.onSwipeDown?.();
      else this.onSwipeUp?.();
    }
  }
}
