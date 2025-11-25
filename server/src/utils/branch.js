export function isAdmin(user = {}) {
  return user?.role === 'admin';
}

export function normalizeBranchValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (['null', 'none'].includes(lowered)) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function buildBranchFilter({ user, column = 'branch_id', queryValue }) {
  const admin = isAdmin(user);
  const userBranch = user?.branch_id ?? null;

  if (admin) {
    if (typeof queryValue === 'string' && queryValue.toLowerCase() === 'all') {
      return { clause: '', params: [] };
    }
    if (typeof queryValue === 'string' && queryValue.toLowerCase() === 'null') {
      return { clause: ` AND ${column} IS NULL`, params: [] };
    }
    const target = normalizeBranchValue(queryValue ?? userBranch);
    if (target === null) {
      return { clause: ` AND ${column} IS NULL`, params: [] };
    }
    return { clause: ` AND (${column} IS NULL OR ${column} = ?)`, params: [target] };
  }

  if (userBranch === null || userBranch === undefined) {
    return { clause: ` AND ${column} IS NULL`, params: [] };
  }
  return { clause: ` AND (${column} IS NULL OR ${column} = ?)`, params: [userBranch] };
}

export function resolveBranchForWrite(user = {}, provided) {
  const admin = isAdmin(user);
  if (!admin) {
    return user?.branch_id ?? null;
  }
  return normalizeBranchValue(provided ?? user?.branch_id ?? null);
}

export function canAccessBranch(user = {}, resourceBranchId) {
  if (isAdmin(user)) return true;
  const branchId = user?.branch_id ?? null;
  if (branchId === null || branchId === undefined) {
    return resourceBranchId === null || resourceBranchId === undefined;
  }
  return resourceBranchId === null || resourceBranchId === branchId;
}
