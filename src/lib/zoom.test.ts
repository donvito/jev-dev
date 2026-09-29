import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyZoom, readZoomPreference, saveZoomPreference, stepZoom, zoomShortcut } from './zoom';

const native = vi.hoisted(() => ({ isTauri: vi.fn(() => true), setZoom: vi.fn(async (_scale: number) => {}) }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: native.isTauri }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ setZoom: native.setZoom }) }));

beforeEach(() => { native.isTauri.mockReturnValue(true); native.setZoom.mockReset().mockResolvedValue(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('app zoom', () => {
  it('keeps a recent preference over a stale workspace and rejects unsupported saved values', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    expect(readZoomPreference()).toBe(100);
    saveZoomPreference(150);
    expect(readZoomPreference(100)).toBe(150);
    values.set('jev-dev-zoom', '1000');
    expect(readZoomPreference(125)).toBe(125);
    expect(readZoomPreference(-1)).toBe(100);
    vi.stubGlobal('localStorage', undefined);
    expect(readZoomPreference(75)).toBe(75);
    expect(() => saveZoomPreference(125)).not.toThrow();
  });

  it('stops at the supported bounds', () => {
    expect(stepZoom(75, -1)).toBe(75);
    expect(stepZoom(200, 1)).toBe(200);
  });

  it('supports Command, Control, and numpad shortcuts without consuming ordinary typing or AltGr', () => {
    const event = { key: '=', code: 'Equal', metaKey: false, ctrlKey: false, altKey: false };
    expect(zoomShortcut(event)).toBeNull();
    expect(zoomShortcut({ ...event, metaKey: true })).toBe('in');
    expect(zoomShortcut({ ...event, key: '+', ctrlKey: true })).toBe('in');
    expect(zoomShortcut({ ...event, key: '-', ctrlKey: true })).toBe('out');
    expect(zoomShortcut({ ...event, key: '0', metaKey: true })).toBe('reset');
    expect(zoomShortcut({ ...event, key: 'Add', code: 'NumpadAdd', ctrlKey: true })).toBe('in');
    expect(zoomShortcut({ ...event, key: 'Insert', code: 'Numpad0', ctrlKey: true })).toBeNull();
    expect(zoomShortcut({ ...event, ctrlKey: true, altKey: true })).toBeNull();
  });

  it('serializes native changes and recovers after a rejected change', async () => {
    let finish!: () => void;
    native.setZoom.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = applyZoom(125);
    const second = applyZoom(150);
    await vi.waitFor(() => expect(native.setZoom).toHaveBeenCalledTimes(1));
    finish();
    await Promise.all([first, second]);
    expect(native.setZoom.mock.calls).toEqual([[1.25], [1.5]]);
    native.setZoom.mockRejectedValueOnce(new Error('Zoom unavailable'));
    await expect(applyZoom(175)).rejects.toThrow('Zoom unavailable');
    await expect(applyZoom(100)).resolves.toBeUndefined();
    expect(native.setZoom).toHaveBeenLastCalledWith(1);
  });
});
