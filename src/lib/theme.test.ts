import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readThemePreference, resolveTheme, saveThemePreference, type ThemePreference } from './theme';

const THEME_KEY = 'jev-dev-theme';

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
  it.each([
    ['dark', 'light'],
    ['light', 'dark'],
    ['system', 'dark'],
  ] as const)('uses the newer cached %s preference over stale workspace %s', (cached, workspace) => {
    mockStorage(cached);
    expect(readThemePreference(workspace)).toBe(cached);
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

  it('falls back to a valid workspace preference when no cache exists', () => {
    mockStorage();
    expect(readThemePreference('dark')).toBe('dark');
    expect(readThemePreference('light')).toBe('light');
    expect(readThemePreference('system')).toBe('system');
  });

  it('ignores invalid cache values and defaults invalid or missing workspace data to system', () => {
    mockStorage('invalid-theme');
    expect(readThemePreference('light')).toBe('light');
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
  });
});

describe('theme resolution', () => {
  it.each<[ThemePreference, boolean, 'light' | 'dark']>([
    ['light', false, 'light'], ['light', true, 'light'],
    ['dark', false, 'dark'], ['dark', true, 'dark'],
    ['system', false, 'light'], ['system', true, 'dark'],
  ])('resolves %s with systemDark=%s to %s', (preference, systemDark, expected) => {
    expect(resolveTheme(preference, systemDark)).toBe(expected);
  });

  it('reads the current operating system preference when none is provided', () => {
    const matchMedia = vi.fn().mockReturnValueOnce({ matches: true }).mockReturnValueOnce({ matches: false });
    vi.stubGlobal('window', { matchMedia });
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('system')).toBe('light');
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });
});
