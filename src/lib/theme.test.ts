import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme, getThemeColorScheme, getThemeDefinition, isThemePreference,
  readThemePreference, resolveTheme, saveThemePreference, THEMES,
  type ColorScheme, type ResolvedTheme,
} from './theme';

const THEME_KEY = 'jev-dev-theme';
const palettes: [ResolvedTheme, ColorScheme, string][] = [
  ['light', 'light', '#f7f7f7'],
  ['dark', 'dark', '#111111'],
  ['ocean', 'dark', '#101b2b'],
  ['forest', 'dark', '#111e19'],
  ['lavender', 'light', '#f6f3fb'],
  ['sand', 'light', '#f8f3e9'],
];
const preferences = ['system', ...palettes.map(([theme]) => theme)] as const;

function mockStorage(cached?: string) {
  const values = new Map<string, string>(cached === undefined ? [] : [[THEME_KEY, cached]]);
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('theme preference persistence', () => {
  it.each(preferences)('persists %s and uses the newer cache over stale workspace data', preference => {
    const storage = mockStorage('light');
    saveThemePreference(preference);
    expect(storage.setItem).toHaveBeenCalledWith(THEME_KEY, preference);
    expect(readThemePreference('dark')).toBe(preference);
  });

  it('keeps a new preference through late painting of a stale workspace theme', () => {
    const storage = mockStorage('light');
    const documentElement = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
    const meta = { setAttribute: vi.fn() };
    vi.stubGlobal('document', { documentElement, querySelector: vi.fn(() => meta) });

    saveThemePreference('dark');
    applyTheme('light', 'light');

    // Painting a restored workspace cannot erase the user's newer cached choice.
    expect(documentElement.dataset.theme).toBe('light');
    expect(documentElement.style.colorScheme).toBe('light');
    expect(meta.setAttribute).toHaveBeenCalledWith('content', '#f7f7f7');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(THEME_KEY, 'dark');
    expect(readThemePreference('light')).toBe('dark');
  });

  it.each(preferences)('falls back to workspace %s when no cache exists', preference => {
    mockStorage();
    expect(readThemePreference(preference)).toBe(preference);
  });

  it.each(['invalid-theme', '', 'Ocean', 'DARK', 'null'])('ignores invalid cached %s', cached => {
    mockStorage(cached);
    expect(readThemePreference('forest')).toBe('forest');
    for (const workspace of [undefined, null, '', 'invalid-theme', 1, {}]) {
      expect(readThemePreference(workspace)).toBe('system');
    }
  });

  it('uses workspace or system when browser storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => { throw new Error('Storage access denied'); }),
      setItem: vi.fn(() => { throw new Error('Storage access denied'); }),
    });
    expect(readThemePreference('dark')).toBe('dark');
    expect(readThemePreference()).toBe('system');
    expect(() => saveThemePreference('light')).not.toThrow();
  });

  it('uses workspace or system when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readThemePreference('light')).toBe('light');
    expect(readThemePreference()).toBe('system');
    expect(() => saveThemePreference('ocean')).not.toThrow();
  });
});

describe('theme resolution', () => {
  it.each(palettes)('preserves the %s palette regardless of operating system appearance', theme => {
    const matchMedia = vi.fn(() => { throw new Error('Explicit palettes must not query the system'); });
    vi.stubGlobal('window', { matchMedia });
    expect(resolveTheme(theme)).toBe(theme);
    expect(resolveTheme(theme, false)).toBe(theme);
    expect(resolveTheme(theme, true)).toBe(theme);
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it('uses an explicit system preference without accessing the browser', () => {
    vi.stubGlobal('window', undefined);
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('reads the current operating system preference when none is provided', () => {
    const matchMedia = vi.fn().mockReturnValueOnce({ matches: true }).mockReturnValueOnce({ matches: false });
    vi.stubGlobal('window', { matchMedia });
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('system')).toBe('light');
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });
});

describe('theme catalog', () => {
  it('lists each supported palette once with presentation metadata', () => {
    expect(THEMES.map(theme => theme.id)).toEqual(palettes.map(([theme]) => theme));
    for (const [theme, colorScheme, canvas] of palettes) {
      const definition = getThemeDefinition(theme);
      expect(definition).toMatchObject({ id: theme, colorScheme, canvas });
      expect(definition.label).not.toBe('');
      expect(definition.description).not.toBe('');
      expect(definition.surface).toMatch(/^#[0-9a-f]{6}$/);
      expect(definition.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(getThemeColorScheme(theme)).toBe(colorScheme);
    }
  });

  it.each(preferences)('accepts %s as a saved preference', preference => {
    expect(isThemePreference(preference)).toBe(true);
  });

  it.each([undefined, null, '', 'Ocean', 'invalid-theme', 0, false, {}, ['dark']])('rejects invalid preference %j', value => {
    expect(isThemePreference(value)).toBe(false);
  });
});

describe('theme painting', () => {
  it.each(palettes)('paints %s with the correct native color scheme and browser canvas', (theme, colorScheme, canvas) => {
    const documentElement = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
    const meta = { setAttribute: vi.fn() };
    const querySelector = vi.fn(() => meta);
    const storage = mockStorage('light');
    vi.stubGlobal('document', { documentElement, querySelector });
    vi.stubGlobal('window', undefined);

    applyTheme(theme);

    expect(documentElement.dataset.theme).toBe(theme);
    expect(documentElement.style.colorScheme).toBe(colorScheme);
    expect(querySelector).toHaveBeenCalledWith('meta[name="theme-color"]');
    expect(meta.setAttribute).toHaveBeenCalledWith('content', canvas);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('paints a resolved system preference and tolerates a missing browser theme meta tag', () => {
    const documentElement = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
    vi.stubGlobal('document', { documentElement, querySelector: vi.fn(() => null) });
    vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches: true })) });

    expect(() => applyTheme('system')).not.toThrow();
    expect(documentElement.dataset.theme).toBe('dark');
    expect(documentElement.style.colorScheme).toBe('dark');
  });
});
