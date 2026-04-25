/**
 * Controls help overlay — shows all keyboard, VR, and MIDI mappings.
 * Toggle with ? button or 'h' key.
 */

export class HelpOverlay {
  private overlay: HTMLDivElement;
  private visible = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'help-overlay';

    const backdrop = document.createElement('div');
    backdrop.className = 'help-backdrop';
    backdrop.addEventListener('click', () => this.hide());

    const content = document.createElement('div');
    content.className = 'help-content';

    const title = document.createElement('h2');
    title.textContent = 'Controls';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'help-close';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => this.hide());

    const sections = document.createElement('div');
    sections.className = 'help-sections';

    // Keyboard section
    const kbd = this.createSection('Keyboard', [
      ['N / \u2192', 'Next preset'],
      ['P / \u2190', 'Previous preset'],
      ['R', 'Random preset'],
      ['B', 'Toggle preset browser'],
      ['F', 'Favorite current preset'],
      ['H / ?', 'Toggle this help screen'],
    ]);

    // VR section
    const vr = this.createSection('VR Controllers (Quest)', [
      ['Left stick flick L/R', 'Prev / next preset'],
      ['Hold A + left stick', 'Zoom (up/down) \u00B7 Rotation (left/right)'],
      ['Hold B + left stick', 'Warp (up/down) \u00B7 Trail decay (left/right)'],
      ['Hold X + left stick', 'Green color (up/down) \u00B7 Red\u2194Blue (left/right)'],
      ['Hold Y + left stick', 'Brightness (up/down) \u00B7 Wave scale (left/right)'],
      ['Left trigger', 'Random preset'],
      ['Right trigger', 'Reset all overrides'],
      ['Left stick press', 'Toggle passthrough mode'],
    ]);

    // Touch section
    const touchSection = this.createSection('Mobile Touch', [
      ['Swipe left / right', 'Next / previous preset'],
      ['Swipe up', 'Open preset browser'],
      ['Swipe down', 'Close preset browser'],
      ['Tap', 'Show / hide controls'],
      ['Double-tap', 'Random preset'],
    ]);

    // MIDI section
    const midiSection = this.createSection('MIDI Controller', [
      ['Any knob/fader', 'Click MIDI \u2192 MIDI Learn to assign'],
      ['Any key/pad', 'Random preset'],
    ]);

    sections.appendChild(kbd);
    sections.appendChild(vr);
    sections.appendChild(touchSection);
    sections.appendChild(midiSection);

    content.appendChild(title);
    content.appendChild(closeBtn);
    content.appendChild(sections);
    this.overlay.appendChild(backdrop);
    this.overlay.appendChild(content);
    document.body.appendChild(this.overlay);

    // Style
    const style = document.createElement('style');
    style.textContent = `
      #help-overlay {
        display: none; position: fixed; inset: 0; z-index: 60;
      }
      #help-overlay.open { display: flex; align-items: center; justify-content: center; }
      .help-backdrop {
        position: absolute; inset: 0; background: rgba(0,0,0,0.8);
      }
      .help-content {
        position: relative; background: rgba(15,15,20,0.98);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
        padding: 28px 32px; max-width: 700px; width: 90%; max-height: 85vh;
        overflow-y: auto; backdrop-filter: blur(20px);
      }
      .help-content h2 {
        font-size: 20px; margin-bottom: 20px; font-weight: 500;
      }
      .help-close {
        position: absolute; top: 16px; right: 16px; background: none;
        border: none; color: rgba(255,255,255,0.5); font-size: 20px;
        cursor: pointer; padding: 4px 8px;
      }
      .help-close:hover { color: #fff; }
      .help-sections { display: flex; flex-wrap: wrap; gap: 24px; }
      .help-section { flex: 1; min-width: 280px; }
      .help-section h3 {
        font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px;
        color: rgba(255,255,255,0.4); margin-bottom: 10px; font-weight: 500;
      }
      .help-row {
        display: flex; justify-content: space-between; padding: 5px 0;
        font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .help-key {
        color: rgba(255,255,255,0.9); font-family: monospace;
        background: rgba(255,255,255,0.08); padding: 2px 8px;
        border-radius: 4px; font-size: 12px; white-space: nowrap;
      }
      .help-desc { color: rgba(255,255,255,0.55); text-align: right; }
      .help-content::-webkit-scrollbar { width: 6px; }
      .help-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
    `;
    document.head.appendChild(style);
  }

  private createSection(title: string, rows: [string, string][]): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'help-section';

    const h3 = document.createElement('h3');
    h3.textContent = title;
    section.appendChild(h3);

    for (const [key, desc] of rows) {
      const row = document.createElement('div');
      row.className = 'help-row';

      const keyEl = document.createElement('span');
      keyEl.className = 'help-key';
      keyEl.textContent = key;

      const descEl = document.createElement('span');
      descEl.className = 'help-desc';
      descEl.textContent = desc;

      row.appendChild(keyEl);
      row.appendChild(descEl);
      section.appendChild(row);
    }

    return section;
  }

  show(): void {
    this.visible = true;
    this.overlay.classList.add('open');
  }

  hide(): void {
    this.visible = false;
    this.overlay.classList.remove('open');
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }
}
