const shortcuts = new Map();

export const COMMON_SHORTCUTS = {
  SEARCH: 'ctrl+k',
  NEW_BOOK: 'ctrl+n',
  NEW_MEMBER: 'ctrl+shift+n',
  SAVE: 'ctrl+s',
  ESCAPE: 'escape',
};

export function registerShortcut(key, handler) {
  shortcuts.set(key.toLowerCase(), handler);
}

export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const key = [];
    if (e.ctrlKey || e.metaKey) key.push('ctrl');
    if (e.shiftKey) key.push('shift');
    if (e.altKey) key.push('alt');
    key.push(e.key.toLowerCase());
    
    const shortcut = key.join('+');
    const handler = shortcuts.get(shortcut);
    
    if (handler) {
      e.preventDefault();
      handler(e);
    }
  });
}

// Initialize on load
if (typeof document !== 'undefined') {
  initKeyboardShortcuts();
}

