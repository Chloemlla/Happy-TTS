export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme_preference';

export function getStoredTheme(): ThemeMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
    return null;
  } catch {
    return null;
  }
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveInitialTheme(): 'light' | 'dark' {
  const stored = getStoredTheme();
  if (!stored || stored === 'system') {
    return getSystemPrefersDark() ? 'dark' : 'light';
  }
  return stored;
}

export function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function setThemePreference(theme: ThemeMode) {
  try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
}

export function initTheme() {
  const initial = resolveInitialTheme();
  applyTheme(initial);
}

export function toggleTheme(): 'light' | 'dark' {
  const currentIsDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const next: 'light' | 'dark' = currentIsDark ? 'light' : 'dark';
  applyTheme(next);
  setThemePreference(next);
  return next;
}
