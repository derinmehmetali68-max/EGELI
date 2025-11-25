import { describe, it, expect } from 'vitest';
import { preferenceToQuery, preferenceToBranchId } from '../src/utils/branch';

describe('branch preference helpers', () => {
  it('maps preference to query parameter', () => {
    expect(preferenceToQuery('user')).toBeUndefined();
    expect(preferenceToQuery('all')).toBe('all');
    expect(preferenceToQuery('null')).toBe('null');
    expect(preferenceToQuery('5')).toBe('5');
  });

  it('derives branch id for write operations', () => {
    expect(preferenceToBranchId('user', 3)).toBe(3);
    expect(preferenceToBranchId('user', null)).toBeNull();
    expect(preferenceToBranchId('null', 3)).toBeNull();
    expect(preferenceToBranchId('all', 2)).toBe(2);
    expect(preferenceToBranchId('7', 1)).toBe(7);
  });
});
