import { afterEach, describe, expect, it, vi } from 'vitest';
import { isExecutionMode, readExecutionMode, saveExecutionMode } from './execution-mode';

const KEY = 'jev-dev-execution-mode';

function mockStorage(cached?: string) {
  const values = new Map<string, string>(cached === undefined ? [] : [[KEY, cached]]);
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('execution mode preference', () => {
  it('recognizes only explicit demo and live modes', () => {
    expect(isExecutionMode('demo')).toBe(true);
    expect(isExecutionMode('live')).toBe(true);
    for (const value of [undefined, null, '', 'LIVE', 'system', true, {}]) expect(isExecutionMode(value)).toBe(false);
  });

  it('defaults to live when the caller reports a saved key and no preference exists', () => {
    mockStorage();
    expect(readExecutionMode(true)).toBe('live');
  });

  it('forces demo in a browser or without a key despite live preferences', () => {
    const storage = mockStorage('live');
    expect(readExecutionMode(false, 'live')).toBe('demo');
    expect(storage.getItem).not.toHaveBeenCalled();
    // Availability must not overwrite the saved user preference.
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('preserves an explicit demo preference even when live execution is available', () => {
    mockStorage('demo');
    expect(readExecutionMode(true)).toBe('demo');
    mockStorage();
    expect(readExecutionMode(true, 'demo')).toBe('demo');
  });

  it.each([['demo', 'live'], ['live', 'demo']] as const)('keeps cached %s ahead of delayed workspace %s', (current, stale) => {
    const storage = mockStorage(stale);
    saveExecutionMode(current);
    expect(storage.setItem).toHaveBeenCalledWith(KEY, current);
    expect(readExecutionMode(true, stale)).toBe(current);
  });

  it('falls back to valid workspace preferences when storage has no valid choice', () => {
    for (const cached of [undefined, '', 'invalid']) {
      mockStorage(cached);
      expect(readExecutionMode(true, 'live')).toBe('live');
      expect(readExecutionMode(true, 'demo')).toBe('demo');
      expect(readExecutionMode(true, 'invalid')).toBe('live');
    }
  });

  it('handles denied storage without losing workspace fallback or availability gating', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => { throw new Error('Storage denied'); }),
      setItem: vi.fn(() => { throw new Error('Storage denied'); }),
    });
    expect(readExecutionMode(true, 'demo')).toBe('demo');
    expect(readExecutionMode(true)).toBe('live');
    expect(readExecutionMode(false, 'live')).toBe('demo');
    expect(() => saveExecutionMode('demo')).not.toThrow();
  });

  it('handles missing localStorage without losing workspace fallback', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readExecutionMode(true, 'demo')).toBe('demo');
    expect(readExecutionMode(true)).toBe('live');
    expect(readExecutionMode(false)).toBe('demo');
    expect(() => saveExecutionMode('live')).not.toThrow();
  });
});
