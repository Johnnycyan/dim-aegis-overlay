import { WishlistDatabase, ScoringResult } from './types';

// Numeric weight for comparing grades
const GRADE_WEIGHTS: Record<'S' | 'A' | 'B' | 'C', number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
};

/**
 * Compares a weapon's rolled perks against the cached wishlist database entries
 * for that weapon and returns the best matching grade and details.
 *
 * @param itemHash The weapon's itemHash.
 * @param rolledPerks The perk hashes currently active/rolled on the weapon instance.
 * @param database The parsed WishlistDatabase.
 * @returns The best ScoringResult found, or a null result if no match is found.
 */
export function scoreWeapon(
  itemHash: number,
  rolledPerks: number[],
  database: WishlistDatabase,
  enhancedToNormalMap?: Record<number, number>
): ScoringResult {
  const defaultResult: ScoringResult = {
    grade: null,
    matchPercentage: 0,
    matchedPerks: [],
    missingPerks: [],
    notes: '',
    wishlistPerks: [],
  };

  // If there are no wishlist entries for this weapon, return default
  const recommendations = database[itemHash];
  if (!recommendations || recommendations.length === 0) {
    return defaultResult;
  }

  // Build the set of rolled perks.
  // If a perk is enhanced, also include its normal counterpart in the rolled set
  // so it matches wishlist lines that specify normal perk hashes.
  const rolledSet = new Set<number>();
  for (const perk of rolledPerks) {
    rolledSet.add(perk);
    if (enhancedToNormalMap && enhancedToNormalMap[perk]) {
      rolledSet.add(enhancedToNormalMap[perk]);
    }
  }

  let bestResult: ScoringResult | null = null;

  for (const rec of recommendations) {
    const matched: number[] = [];
    const missing: number[] = [];

    // Check each required perk in the wishlist entry
    for (const perk of rec.perks) {
      if (rolledSet.has(perk)) {
        matched.push(perk);
      } else {
        missing.push(perk);
      }
    }

    const missingCount = missing.length;
    let grade: 'S' | 'A' | 'B' | 'C' | null = null;

    // Determine grade based on missing perks count
    if (missingCount === 0) {
      grade = 'S';
    } else if (missingCount === 1) {
      grade = 'A';
    } else if (missingCount === 2) {
      grade = 'B';
    } else if (missingCount === 3) {
      grade = 'C';
    }

    // If more than 3 perks are missing, it's not a valid match grade
    if (grade === null) {
      continue;
    }

    const matchPercentage = Math.round((matched.length / rec.perks.length) * 100);

    const result: ScoringResult = {
      grade,
      matchPercentage,
      matchedPerks: matched,
      missingPerks: missing,
      notes: rec.notes,
      wishlistPerks: rec.perks,
    };

    // Keep track of the best match (highest grade, then highest match percentage)
    if (!bestResult) {
      bestResult = result;
    } else {
      const currentWeight = GRADE_WEIGHTS[result.grade as 'S' | 'A' | 'B' | 'C'];
      const bestWeight = GRADE_WEIGHTS[bestResult.grade as 'S' | 'A' | 'B' | 'C'];

      if (currentWeight > bestWeight) {
        bestResult = result;
      } else if (currentWeight === bestWeight && result.matchPercentage > bestResult.matchPercentage) {
        bestResult = result;
      }
    }
  }

  return bestResult || defaultResult;
}
