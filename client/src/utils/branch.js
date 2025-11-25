const PREF_KEY = 'branchPreference';

export function getBranchPreference(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  if (!storage) return 'user';
  return storage.getItem(PREF_KEY) || 'user';
}

export function setBranchPreference(value, storage = typeof window !== 'undefined' ? window.localStorage : null) {
  if (!storage) return;
  storage.setItem(PREF_KEY, value);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('branch-change', { detail: value }));
  }
}

export function preferenceToQuery(pref) {
  if (!pref || pref === 'user') return undefined;
  return pref;
}

export function preferenceToBranchId(pref, userBranchId = null) {
  if (!pref || pref === 'user') return userBranchId ?? null;
  if (pref === 'all') return userBranchId ?? null;
  if (pref === 'null') return null;
  const numeric = Number(pref);
  return Number.isFinite(numeric) ? numeric : userBranchId ?? null;
}

export function describeBranch(pref, branches = [], userBranchId = null) {
  const lookup = new Map(branches.map(b => [String(b.id), b.name]));
  if (pref === 'all') return 'Tüm Şubeler';
  if (pref === 'null') return 'Şubesiz Kayıtlar';
  if (!pref || pref === 'user') {
    const key = userBranchId != null ? String(userBranchId) : null;
    if (key && lookup.has(key)) return lookup.get(key);
    return userBranchId == null ? 'Şubesiz' : `Şube #${userBranchId}`;
  }
  return lookup.get(String(pref)) || `Şube #${pref}`;
}
