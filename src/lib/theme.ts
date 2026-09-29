export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
const THEME_KEY = 'jev-dev-theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readThemePreference(workspacePreference?: unknown): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (isThemePreference(value)) return value;
  } catch { /* The workspace still saves the preference if browser storage is unavailable. */ }
  return isThemePreference(workspacePreference) ? workspacePreference : 'system';
}

export function saveThemePreference(preference: ThemePreference) {
  try { localStorage.setItem(THEME_KEY, preference); } catch { /* The workspace also saves the preference. */ }
}

export function resolveTheme(preference: ThemePreference, systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

export function applyTheme(preference: ThemePreference, resolved = resolveTheme(preference)) {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#111111' : '#f7f7f7');
}
