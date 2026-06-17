import { scoreWeapon } from './scorer';
import { WishlistDatabase, ScoringResult } from './types';
import { showTooltip, hideTooltip } from './tooltip';

let wishlistDb: WishlistDatabase = {};
let enhancedToNormalMap: Record<number, number> = {};
let scoringSource = 'aegis';
let lightggDb: Record<string, string> = {};
let hoveredElement: HTMLElement | null = null;
let registryObserver: MutationObserver | null = null;

/**
 * Sets up a MutationObserver on the global perk registry element to watch for
 * resolved perk names and trigger real-time updates to the active tooltip.
 */
function setupRegistryObserver() {
  if (registryObserver) return;
  const registryEl = document.getElementById('aegis-global-perk-registry');
  if (!registryEl) return;

  registryObserver = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-registry') {
        const registryStr = registryEl.getAttribute('data-registry');
        if (registryStr) {
          try {
            chrome.storage.local.set({ perkRegistry: JSON.parse(registryStr) });
          } catch (e) {
            // Ignore
          }
        }

        if (hoveredElement) {
          const result = (hoveredElement as any)._aegisResult as ScoringResult;
          const name = (hoveredElement as any)._aegisName as string;
          const perksMap = (hoveredElement as any)._aegisPerksMap as Record<number, { name: string; icon: string }>;
          const activeHashes = (hoveredElement as any)._aegisActiveHashes as number[];
          if (result && result.grade) {
            showTooltip(hoveredElement, result, name, perksMap, activeHashes);
          }
        }
      }
    }
  });

  registryObserver.observe(registryEl, {
    attributes: true,
    attributeFilter: ['data-registry'],
  });
}

// Load wishlist & config on startup
chrome.storage.local.get(['wishlistData', 'enhancedToNormal', 'scoringSource', 'lightggData'], (res) => {
  wishlistDb = res.wishlistData || {};
  enhancedToNormalMap = res.enhancedToNormal || {};
  scoringSource = res.scoringSource || 'aegis';
  lightggDb = res.lightggData || {};
  console.log(`DIM Aegis Overlay: Loaded configuration. Source: ${scoringSource}`);
  reprocessAllElements();
});

// Watch for changes in storage (e.g. manual sync from settings popup)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    let changed = false;
    if (changes.wishlistData) {
      wishlistDb = changes.wishlistData.newValue || {};
      changed = true;
    }
    if (changes.enhancedToNormal) {
      enhancedToNormalMap = changes.enhancedToNormal.newValue || {};
      changed = true;
    }
    if (changes.scoringSource) {
      scoringSource = changes.scoringSource.newValue || 'aegis';
      changed = true;
    }
    if (changes.lightggData) {
      lightggDb = changes.lightggData.newValue || {};
      changed = true;
    }
    if (changed) {
      console.log('DIM Aegis Overlay: Storage updated, re-scoring elements.');
      reprocessAllElements();
    }
  }
});


/**
 * Handles showing the tooltip when the mouse enters a weapon tile.
 */
function handleMouseEnter(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  hoveredElement = el;
  setupRegistryObserver();
  const result = (el as any)._aegisResult as ScoringResult;
  const name = (el as any)._aegisName as string;
  const perksMap = (el as any)._aegisPerksMap as Record<number, { name: string; icon: string }>;
  const activeHashes = (el as any)._aegisActiveHashes as number[];

  if (result && result.grade) {
    showTooltip(el, result, name, perksMap, activeHashes);
  }
}

/**
 * Handles hiding the tooltip when the mouse leaves a weapon tile.
 */
function handleMouseLeave() {
  hoveredElement = null;
  hideTooltip();
}

/**
 * Injects or updates the Aegis rank badge overlay inside a weapon tile.
 */
function injectBadge(el: HTMLElement, result: ScoringResult) {
  // Find the inner tile container (the square item box) to append the badge to,
  // so the badge sits in the bottom-right of the image rather than overlapping the bottom bar (power level/wishlist tags).
  let badgeTarget = el.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"]') as HTMLElement | null;
  if (badgeTarget) {
    // Ensure the badge target is relatively positioned so the absolute badge is anchored to it
    badgeTarget.style.setProperty('position', 'relative', 'important');
  } else {
    badgeTarget = el;
  }

  let badge = badgeTarget.querySelector('.aegis-badge') as HTMLDivElement | null;
  
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'aegis-badge';
    badgeTarget.appendChild(badge);
  }

  // Remove existing grade classes
  badge.classList.remove('aegis-badge-s', 'aegis-badge-a', 'aegis-badge-b', 'aegis-badge-c', 'aegis-badge-d', 'aegis-badge-f');
  
  // Set grade class and text (normalizing S+ / A- etc. to the first letter class)
  const baseLetter = result.grade ? result.grade.charAt(0).toLowerCase() : '';
  badge.classList.add(`aegis-badge-${baseLetter}`);
  badge.textContent = result.grade || '';
}

/**
 * Removes the Aegis badge overlay from a weapon tile if it exists.
 */
function removeBadge(el: HTMLElement) {
  const badge = el.querySelector('.aegis-badge');
  if (badge) {
    badge.remove();
  }
}

/**
 * Evaluates a single weapon tile element, calculates its grade, and applies overlay UI.
 */
function processElement(el: HTMLElement) {
  // If an ancestor is also annotated, this is a nested child element.
  // We skip it to avoid double badges, but clean up any existing badge/listeners on it first.
  const parentWrapper = el.parentElement?.closest('[data-aegis-item-hash]');
  if (parentWrapper) {
    removeBadge(el);
    if (el.hasAttribute('data-aegis-listeners')) {
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeAttribute('data-aegis-listeners');
    }
    return;
  }

  const itemHashStr = el.getAttribute('data-aegis-item-hash');
  const weaponName = el.getAttribute('data-aegis-item-name') || 'Unknown Weapon';
  const perkHashesStr = el.getAttribute('data-aegis-perk-hashes');
  const perksDataStr = el.getAttribute('data-aegis-perks-data');

  if (!itemHashStr || !perkHashesStr) {
    return;
  }

  try {
    const itemHash = parseInt(itemHashStr, 10);
    const perkHashes = perkHashesStr
      .split(',')
      .map((h) => parseInt(h.trim(), 10))
      .filter((h) => !isNaN(h));
    
    let perksMap = {};
    if (perksDataStr) {
      perksMap = JSON.parse(perksDataStr);
    }

    let result: ScoringResult;

    if (scoringSource === 'lightgg') {
      // Use the explicitly stored instance ID (written by main-world-content.ts from item.id)
      // Fall back to parsing el.id (e.g. "item-619283...") for older element formats
      const rawInstanceId = el.getAttribute('data-aegis-instance-id') || el.id.replace('item-', '');
      // Strip any non-numeric prefix (e.g. Light.gg uses 'i' prefix on some IDs)
      const instanceId = rawInstanceId.replace(/^[^0-9]+/, '');
      const grade = lightggDb[instanceId];
      // Debug: log first few lookups to verify ID matching
      if (Object.keys(lightggDb).length > 0 && !el.hasAttribute('data-aegis-lgg-checked')) {
        el.setAttribute('data-aegis-lgg-checked', 'true');
        const sample = Object.keys(lightggDb)[0];
        console.log(`[DIM Aegis Overlay LGG] ID lookup: rawId="${rawInstanceId}" → instanceId="${instanceId}" | grade="${grade || 'NOT FOUND'}" | DB sample key="${sample}"`);
      }
      if (grade) {
        result = {
          grade: grade as any,
          matchPercentage: 100,
          matchedPerks: [],
          missingPerks: [],
          notes: 'Community popularity rating from Light.gg Roll Appraiser.',
          wishlistPerks: [],
        };
      } else {
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: '',
          wishlistPerks: [],
        };
      }
    } else {
      // Score the weapon roll using standard Aegis wishlist
      result = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
    }

    const activePerksDataStr = el.getAttribute('data-aegis-active-perk-hashes');
    let activeHashes: number[] = [];
    if (activePerksDataStr) {
      activeHashes = activePerksDataStr.split(',').map(Number).filter(h => !isNaN(h) && h > 0);
    }

    // Attach data on the element object for hover events to retrieve
    (el as any)._aegisResult = result;
    (el as any)._aegisName = weaponName;
    (el as any)._aegisPerksMap = perksMap;
    (el as any)._aegisActiveHashes = activeHashes;

    if (result.grade) {
      // Inject rank badge
      injectBadge(el, result);

      // Attach event listeners for the tooltip if not already done
      if (!el.hasAttribute('data-aegis-listeners')) {
        el.addEventListener('mouseenter', handleMouseEnter);
        el.addEventListener('mouseleave', handleMouseLeave);
        el.setAttribute('data-aegis-listeners', 'true');
      }
    } else {
      // If graded previously but now has no grade, remove UI
      removeBadge(el);
      if (el.hasAttribute('data-aegis-listeners')) {
        el.removeEventListener('mouseenter', handleMouseEnter);
        el.removeEventListener('mouseleave', handleMouseLeave);
        el.removeAttribute('data-aegis-listeners');
      }
    }
  } catch (err) {
    console.error('Error processing element in content script:', err);
  }
}

/**
 * Scans the page DOM for annotated item elements and processes them.
 */
function reprocessAllElements() {
  setupRegistryObserver();
  const elements = document.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
  for (let i = 0; i < elements.length; i++) {
    processElement(elements[i]);
  }
}

// 1. Observe the DOM for additions or changes to 'data-aegis-item-hash' or 'data-aegis-perk-hashes'
const observer = new MutationObserver((mutations) => {
  for (let i = 0; i < mutations.length; i++) {
    const mutation = mutations[i];
    
    // Check if the custom data attributes were modified
    if (
      mutation.type === 'attributes' &&
      (mutation.attributeName === 'data-aegis-item-hash' || mutation.attributeName === 'data-aegis-perk-hashes')
    ) {
      processElement(mutation.target as HTMLElement);
    }
    
    // Check for added nodes that might contain our attributes
    if (mutation.type === 'childList') {
      setupRegistryObserver();
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.hasAttribute('data-aegis-item-hash')) {
            processElement(node);
          }
          // Scan children
          const children = node.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
          children.forEach((child) => processElement(child));
        }
      });
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-aegis-item-hash', 'data-aegis-perk-hashes'],
});


// Run initial scan once script loads
reprocessAllElements();
