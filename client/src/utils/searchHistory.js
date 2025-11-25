const HISTORY_KEY = 'search_history';
const MAX_HISTORY = 20;

export function addToSearchHistory(query) {
  if (!query || !query.trim()) return;
  try {
    const history = getSearchHistory();
    const trimmed = query.trim();
    const filtered = history.filter(h => h.toLowerCase() !== trimmed.toLowerCase());
    const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

export function getSearchHistory() {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function clearSearchHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}

