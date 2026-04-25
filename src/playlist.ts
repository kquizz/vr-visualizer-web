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
  url.searchParams.delete('debug');
  return url.toString();
}
