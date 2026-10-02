export type ResolvedTheme = 'light' | 'dark' | 'ocean' | 'forest' | 'lavender' | 'sand';
export type ThemePreference = 'system' | ResolvedTheme;
export type ColorScheme = 'light' | 'dark';

export interface ThemeDefinition {
  readonly id: ResolvedTheme;
  readonly label: string;
  readonly description: string;
  readonly colorScheme: ColorScheme;
  readonly canvas: string;
  readonly surface: string;
  readonly accent: string;
}

export const THEMES = [
  { id: 'light', label: 'Light', description: 'Clean whites and neutral grays.', colorScheme: 'light', canvas: '#f7f7f7', surface: '#ffffff', accent: '#242424' },
  { id: 'dark', label: 'Dark', description: 'Charcoal surfaces and soft whites.', colorScheme: 'dark', canvas: '#111111', surface: '#171717', accent: '#ededed' },
  { id: 'ocean', label: 'Ocean', description: 'Deep navy with cool blue accents.', colorScheme: 'dark', canvas: '#101b2b', surface: '#162438', accent: '#8ac8ff' },
  { id: 'forest', label: 'Forest', description: 'Deep greens with fresh mint accents.', colorScheme: 'dark', canvas: '#111e19', surface: '#172920', accent: '#9bd7b0' },
  { id: 'lavender', label: 'Lavender', description: 'Soft lilac with violet accents.', colorScheme: 'light', canvas: '#f6f3fb', surface: '#ffffff', accent: '#684ca0' },
  { id: 'sand', label: 'Sand', description: 'Warm ivory with earthy brown accents.', colorScheme: 'light', canvas: '#f8f3e9', surface: '#fffcf6', accent: '#805c35' },
] as const satisfies readonly ThemeDefinition[];

const THEME_KEY = 'jev-dev-theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || THEMES.some(theme => theme.id === value);
}

export function getThemeDefinition(theme: ResolvedTheme): ThemeDefinition {
  return THEMES.find(definition => definition.id === theme)!;
}

export function getThemeColorScheme(theme: ResolvedTheme): ColorScheme {
  return getThemeDefinition(theme).colorScheme;
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

export function resolveTheme(preference: ThemePreference, systemDark?: boolean): ResolvedTheme {
  if (preference !== 'system') return preference;
  const dark = systemDark ?? window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

export function applyTheme(preference: ThemePreference, resolved = resolveTheme(preference)) {
  const definition = getThemeDefinition(resolved);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = definition.colorScheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', definition.canvas);
}
