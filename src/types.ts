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
  grade: string | null;
  matchPercentage: number;
  matchedPerks: number[];
  missingPerks: number[];
  notes: string;
  wishlistPerks: number[];
  upgradeAdvice?: string;
  potentialGrade?: string;
  wishlistNotes?: string;
  upgradeAvailable?: boolean;
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
  aegisSheetDb?: AegisSheetDatabase;
  aegisSheetLastSync?: number;
}

/**
 * Data structure representing a single weapon row parsed from Aegis's spreadsheet.
 */
export interface AegisSheetWeapon {
  name: string;
  energy: string;
  frame: string;
  barrel: string;
  mag: string;
  perk1: string;
  perk2: string;
  origin: string;
  notes: string;
  rank: string;
  tier: string;
}

/**
 * Registry of all weapons parsed from the Aegis spreadsheet tabs,
 * containing a flat map of weapons by normalized name and lists grouped by category.
 */
export interface AegisSheetDatabase {
  weapons: Record<string, AegisSheetWeapon>;
  categories: Record<string, AegisSheetWeapon[]>;
}

/**
 * Defines a normalized perk representation for hover tooltips.
 */
export interface TooltipPerk {
  name: string;
  icon?: string;
  matched: boolean;
  type: 'barrel' | 'mag' | 'perk1' | 'perk2' | 'origin';
  status?: 'active' | 'selectable' | 'missing';
}


