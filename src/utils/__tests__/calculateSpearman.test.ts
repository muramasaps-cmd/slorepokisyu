import { describe, it, expect } from 'vitest';
import { calculateSpearman } from '../backtestEngine';

describe('calculateSpearman', () => {
  describe('n < 3 boundary condition', () => {
    it('returns null when arrays are empty (n = 0)', () => {
      expect(calculateSpearman([], [])).toBeNull();
    });

    it('returns null when n = 1', () => {
      expect(calculateSpearman([10], [5])).toBeNull();
    });

    it('returns null when n = 2', () => {
      expect(calculateSpearman([10, 20], [5, 15])).toBeNull();
    });
  });

  describe('valid arrays without ties', () => {
    it('returns 1.0 for perfect positive rank correlation', () => {
      const pred = [100, 80, 60, 40, 20];
      const actual = [50, 40, 30, 20, 10];
      expect(calculateSpearman(pred, actual)).toBe(1);
    });

    it('returns -1.0 for perfect inverse rank correlation', () => {
      const pred = [100, 80, 60, 40, 20];
      const actual = [10, 20, 30, 40, 50];
      expect(calculateSpearman(pred, actual)).toBe(-1);
    });

    it('computes expected correlation for partial agreement', () => {
      const pred = [10, 20, 30, 40, 50];
      const actual = [20, 10, 30, 50, 40];
      const result = calculateSpearman(pred, actual);
      expect(result).toBeGreaterThan(0.7);
      expect(result).toBeLessThan(1.0);
    });
  });

  describe('handling ties (同順位)', () => {
    it('assigns average ranks when ties occur in predicted scores', () => {
      // pred: [100, 80, 80, 50] -> ranks: [1, 2.5, 2.5, 4]
      // actual: [10, 8, 6, 4] -> ranks: [1, 2, 3, 4]
      // sumD2 = 0^2 + 0.5^2 + (-0.5)^2 + 0^2 = 0.5
      // 1 - (6 * 0.5) / (4 * 15) = 1 - 3/60 = 0.95
      const pred = [100, 80, 80, 50];
      const actual = [10, 8, 6, 4];
      expect(calculateSpearman(pred, actual)).toBe(0.95);
    });

    it('handles matching ties in both arrays correctly', () => {
      // Both arrays have two pairs of ties in same order
      const pred = [10, 10, 20, 20];
      const actual = [5, 5, 15, 15];
      expect(calculateSpearman(pred, actual)).toBe(1);
    });

    it('handles multiple identical values across three or more items', () => {
      const pred = [50, 50, 50, 20];
      const actual = [10, 20, 30, 40];
      const result = calculateSpearman(pred, actual);
      expect(typeof result).toBe('number');
      expect(result).not.toBeNull();
    });
  });
});
