import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';

export const ZOOM_LEVELS = [75, 80, 90, 100, 110, 125, 150, 175, 200] as const;
export type ZoomLevel = typeof ZOOM_LEVELS[number];
const ZOOM_KEY = 'jev-dev-zoom';

export function isZoomLevel(value: unknown): value is ZoomLevel {
  return typeof value === 'number' && ZOOM_LEVELS.includes(value as ZoomLevel);
}

export function readZoomPreference(workspacePreference?: unknown): ZoomLevel {
  try {
    const cached = Number(localStorage.getItem(ZOOM_KEY));
    if (isZoomLevel(cached)) return cached;
  } catch { /* Fall back to the workspace when local storage is unavailable. */ }
  return isZoomLevel(workspacePreference) ? workspacePreference : 100;
}

export function saveZoomPreference(level: ZoomLevel) {
  try { localStorage.setItem(ZOOM_KEY, String(level)); } catch { /* Also saved in the workspace. */ }
}

export function stepZoom(level: ZoomLevel, direction: -1 | 1): ZoomLevel {
  return ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(level) + direction))];
}

export function zoomShortcut(event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey'>): 'in' | 'out' | 'reset' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') return 'in';
  if (event.key === '-' || event.code === 'NumpadSubtract') return 'out';
  if (event.key === '0') return 'reset';
  return null;
}

let zoomQueue: Promise<void> = Promise.resolve();

export function applyZoom(level: ZoomLevel): Promise<void> {
  // Serialize native calls so rapid shortcuts cannot finish out of order.
  const task = zoomQueue.catch(() => {}).then(async () => {
    if (isTauri()) {
      await getCurrentWebview().setZoom(level / 100);
    } else {
      document.documentElement.style.zoom = String(level / 100);
      document.documentElement.style.setProperty('--app-viewport-height', `calc(100dvh / ${level / 100})`);
      window.dispatchEvent(new Event('resize'));
    }
  });
  zoomQueue = task;
  return task;
}
