/**
 * Represents a single parsed wishlist entry.
 */
export interface WishlistRoll {
  itemHash: number;
  perks: number[];
  notes: string;
  title?: string;
}

/**
 * The structured database format for the wishlist,
 * mapping weapon item hashes to their multiple recommended rolls.
 */
export type WishlistDatabase = Record<number, WishlistRoll[]>;

/**
 * Result of scoring a weapon roll against a wishlist entry.
 */
export interface ScoringResult {
  grade: 'S' | 'A' | 'B' | 'C' | null;
  matchPercentage: number;
  matchedPerks: number[];
  missingPerks: number[];
  notes: string;
  wishlistPerks: number[];
}

/**
 * Storage schema for chrome.storage.local
 */
export interface LocalStorageSchema {
  wishlistUrl?: string;
  wishlistData?: WishlistDatabase;
  lastUpdated?: number;
  syncStatus?: 'success' | 'loading' | 'error';
  syncError?: string | null;
  parsedCount?: number;
  enhancedToNormal?: Record<number, number>;
}

