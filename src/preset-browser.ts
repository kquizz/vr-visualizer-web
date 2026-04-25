/**
 * Preset browser panel — slide-out list with search, favorites, and hover preview.
 * Hover a preset to preview it live. Click to select. Star to favorite.
 */

import type { MilkdropVisualizer } from './visualizer';

const STORAGE_KEY = 'milkdrop-favorites-only';

export class PresetBrowser {
  private panel: HTMLDivElement;
  private searchInput: HTMLInputElement;
  private list: HTMLDivElement;
  private favToggle: HTMLButtonElement;
  private statsEl: HTMLDivElement;
  private milkdrop: MilkdropVisualizer;
  private visible = false;
  private presetBeforeHover: string | null = null;
  private items: Map<string, HTMLDivElement> = new Map();

  constructor(milkdrop: MilkdropVisualizer) {
    this.milkdrop = milkdrop;

    // Restore favorites-only preference
    milkdrop.useFavorites = localStorage.getItem(STORAGE_KEY) === '1';

    // Build panel using safe DOM methods
    this.panel = document.createElement('div');
    this.panel.id = 'preset-browser';

    const header = document.createElement('div');
    header.className = 'pb-header';

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.id = 'pb-search';
    this.searchInput.placeholder = 'Search presets...';

    this.favToggle = document.createElement('button');
    this.favToggle.id = 'pb-fav-toggle';
    this.favToggle.title = 'Toggle favorites only';
    this.favToggle.textContent = '\u2605'; // ★

    const closeBtn = document.createElement('button');
    closeBtn.id = 'pb-close';
    closeBtn.title = 'Close';
    closeBtn.textContent = '\u2715'; // ✕

    header.appendChild(this.searchInput);
    header.appendChild(this.favToggle);
    header.appendChild(closeBtn);

    this.statsEl = document.createElement('div');
    this.statsEl.className = 'pb-stats';

    this.list = document.createElement('div');
    this.list.className = 'pb-list';

    this.panel.appendChild(header);
    this.panel.appendChild(this.statsEl);
    this.panel.appendChild(this.list);
    document.body.appendChild(this.panel);

    // Style
    const style = document.createElement('style');
    style.textContent = `
      #preset-browser {
        position: fixed; top: 0; right: -380px; width: 380px; height: 100%;
        background: rgba(10, 10, 15, 0.95); z-index: 30;
        display: flex; flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        transition: right 0.25s ease;
        border-left: 1px solid rgba(255,255,255,0.1);
        backdrop-filter: blur(20px);
      }
      #preset-browser.open { right: 0; }
      .pb-header {
        display: flex; gap: 8px; padding: 12px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      #pb-search {
        flex: 1; padding: 8px 12px; border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.15);
        background: rgba(255,255,255,0.05); color: #fff;
        font-size: 14px; outline: none;
      }
      #pb-search:focus { border-color: rgba(255,255,255,0.3); }
      #pb-search::placeholder { color: rgba(255,255,255,0.3); }
      .pb-header button {
        padding: 6px 10px; border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.15);
        background: rgba(255,255,255,0.05); color: #fff;
        cursor: pointer; font-size: 16px;
      }
      .pb-header button:hover { background: rgba(255,255,255,0.15); }
      #pb-fav-toggle.active { color: #ffd700; background: rgba(255,215,0,0.15); border-color: rgba(255,215,0,0.3); }
      .pb-stats {
        padding: 6px 12px; font-size: 12px; color: rgba(255,255,255,0.4);
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }
      .pb-list {
        flex: 1; overflow-y: auto; padding: 4px 0;
      }
      .pb-item {
        display: flex; align-items: center; padding: 8px 12px;
        cursor: pointer; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.7);
        border-bottom: 1px solid rgba(255,255,255,0.03);
      }
      .pb-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
      .pb-item.active { background: rgba(100,140,255,0.15); color: #fff; }
      .pb-item .pb-star {
        flex-shrink: 0; width: 24px; text-align: center;
        color: rgba(255,255,255,0.15); cursor: pointer; font-size: 14px;
      }
      .pb-item .pb-star:hover { color: rgba(255,215,0,0.6); }
      .pb-item .pb-star.fav { color: #ffd700; }
      .pb-item .pb-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pb-list::-webkit-scrollbar { width: 6px; }
      .pb-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
    `;
    document.head.appendChild(style);

    // Events
    closeBtn.addEventListener('click', () => this.hide());
    this.searchInput.addEventListener('input', () => this.filterList());
    this.favToggle.addEventListener('click', () => this.toggleFavoritesOnly());

    this.updateFavToggle();
  }

  populate(): void {
    this.list.replaceChildren();
    this.items.clear();
    console.log(`[PresetBrowser] Populating with ${this.milkdrop.presetNames.length} presets`);

    for (const name of this.milkdrop.presetNames) {
      const item = document.createElement('div');
      item.className = 'pb-item';

      const star = document.createElement('span');
      star.className = 'pb-star' + (this.milkdrop.isFavorite(name) ? ' fav' : '');
      star.textContent = '\u2605'; // ★
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        const isFav = this.milkdrop.toggleFavorite(name);
        star.classList.toggle('fav', isFav);
        this.updateStats();
      });

      const label = document.createElement('span');
      label.className = 'pb-name';
      label.textContent = name;
      label.title = name;

      item.appendChild(star);
      item.appendChild(label);

      // Hover to preview
      item.addEventListener('mouseenter', () => {
        if (this.presetBeforeHover === null) {
          this.presetBeforeHover = this.milkdrop.currentPresetName;
        }
        this.milkdrop.loadPresetByName(name, 0.5);
      });

      // Click to select
      item.addEventListener('click', () => {
        this.presetBeforeHover = null;
        this.milkdrop.loadPresetByName(name, 0.5);
        this.updateActiveHighlight();
      });

      this.list.appendChild(item);
      this.items.set(name, item);
    }

    // Restore previous on mouse leave
    this.list.addEventListener('mouseleave', () => {
      if (this.presetBeforeHover !== null) {
        this.milkdrop.loadPresetByName(this.presetBeforeHover, 0.5);
        this.presetBeforeHover = null;
      }
    });

    this.updateStats();
    this.updateActiveHighlight();
  }

  private filterList(): void {
    const query = this.searchInput.value.toLowerCase();
    // If favorites mode is on but no favorites exist, show all
    const hasFavs = this.milkdrop.favorites.size > 0;
    const filterByFav = this.milkdrop.useFavorites && hasFavs;
    for (const [name, item] of this.items) {
      const match = name.toLowerCase().includes(query);
      const favOk = !filterByFav || this.milkdrop.isFavorite(name);
      item.style.display = (match && favOk) ? 'flex' : 'none';
    }
  }

  private toggleFavoritesOnly(): void {
    this.milkdrop.useFavorites = !this.milkdrop.useFavorites;
    localStorage.setItem(STORAGE_KEY, this.milkdrop.useFavorites ? '1' : '0');
    this.updateFavToggle();
    this.filterList();
  }

  private updateFavToggle(): void {
    this.favToggle.classList.toggle('active', this.milkdrop.useFavorites);
    this.favToggle.title = this.milkdrop.useFavorites
      ? 'Showing favorites only \u2014 click to show all'
      : 'Showing all \u2014 click for favorites only';
  }

  private updateStats(): void {
    const total = this.milkdrop.presetNames.length;
    const favs = this.milkdrop.favorites.size;
    this.statsEl.textContent = `${total} presets \u00B7 ${favs} favorited`;
  }

  updateActiveHighlight(): void {
    const current = this.milkdrop.currentPresetName;
    for (const [name, item] of this.items) {
      item.classList.toggle('active', name === current);
    }
  }

  show(): void {
    this.visible = true;
    this.panel.classList.add('open');
    this.filterList();
    this.updateActiveHighlight();
    this.searchInput.focus();
  }

  hide(): void {
    this.visible = false;
    this.panel.classList.remove('open');
    if (this.presetBeforeHover !== null) {
      this.milkdrop.loadPresetByName(this.presetBeforeHover, 0.5);
      this.presetBeforeHover = null;
    }
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }
}
