export function getThemePreference() {
  try {
    return localStorage.getItem('theme') || 'light';
  } catch {
    return 'light';
  }
}

export function setThemePreference(theme) {
  try {
    localStorage.setItem('theme', theme);
    applyTheme(theme);
    window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
  } catch {}
}

export function applyTheme(theme) {
  try {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  } catch {}
}

// Initialize theme on load
if (typeof document !== 'undefined') {
  applyTheme(getThemePreference());
}
