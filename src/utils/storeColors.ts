/**
 * Centralized Store Color Palette & Assignment Utility
 * Ensures 100% color consistency across StoreComparison, ConditionAnalysis,
 * and all cross-store visualizations.
 */

export const STORE_COLORS: readonly string[] = [
  '#4f46e5', // indigo
  '#059669', // emerald
  '#d97706', // amber
  '#e11d48', // rose
  '#0284c7', // sky
  '#7c3aed', // violet
] as const;

export const ALL_STORES_COLOR = '#1e293b'; // slate-800 for 全店合計
export const ALL_STORES_NAME = '全店合計';
export const ALL_STORES_ID = '__all_stores_total__';

/**
 * Returns a fixed, consistent color for a given store.
 * - If indexOrId is ALL_STORES_ID or ALL_STORES_NAME, returns ALL_STORES_COLOR.
 * - If a number is provided, indexes into STORE_COLORS.
 * - If a store list is provided, finds the index of storeId in that list.
 * - Otherwise falls back to deterministic string hash.
 */
export function getStoreColor(
  storeIdOrIndex: string | number,
  stores?: { id: string }[]
): string {
  if (storeIdOrIndex === ALL_STORES_ID || storeIdOrIndex === ALL_STORES_NAME) {
    return ALL_STORES_COLOR;
  }

  if (typeof storeIdOrIndex === 'number') {
    return STORE_COLORS[Math.abs(storeIdOrIndex) % STORE_COLORS.length];
  }

  if (stores && stores.length > 0) {
    const idx = stores.findIndex((s) => s.id === storeIdOrIndex);
    if (idx >= 0) {
      return STORE_COLORS[idx % STORE_COLORS.length];
    }
  }

  // Deterministic fallback based on string hashing
  let hash = 0;
  for (let i = 0; i < storeIdOrIndex.length; i++) {
    hash = (hash << 5) - hash + storeIdOrIndex.charCodeAt(i);
    hash |= 0;
  }
  return STORE_COLORS[Math.abs(hash) % STORE_COLORS.length];
}
