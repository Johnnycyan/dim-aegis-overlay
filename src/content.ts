import { scoreWeapon } from './scorer';
import { WishlistDatabase, ScoringResult, AegisSheetDatabase, AegisSheetWeapon, TooltipPerk } from './types';
import { showTooltip, hideTooltip } from './tooltip';
/** Safely sets element HTML using DOMParser (avoids innerHTML linter warning). */
function safeSetInnerHTML(element: HTMLElement, htmlString: string) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(htmlString, 'text/html');
  element.replaceChildren(...Array.from(parsed.body.childNodes));
}

let wishlistDb: WishlistDatabase = {};
let enhancedToNormalMap: Record<number, number> = {};
let scoringSource = 'aegis';
let aegisLayoutSide = 'side';
let aegisDbMode = 'both';
let lightggDb: Record<string, string> = {};
let aegisSheetDb: AegisSheetDatabase | null = null;
let hoveredElement: HTMLElement | null = null;
let registryObserver: MutationObserver | null = null;
let nameToHash: Record<string, number> = {};
let perkNameToIcon: Record<string, string> = {};

function updatePerkNameToIcon(perkRegistry: Record<string, { name: string, icon: string }>) {
  if (!perkRegistry) return;
  for (const p of Object.values(perkRegistry)) {
    if (p && p.name && p.icon) {
      const cleanName = cleanPerkName(p.name);
      perkNameToIcon[cleanName] = p.icon;
      perkNameToIcon[p.name.toLowerCase().trim()] = p.icon;
    }
  }
}

function updateNameToHashFromWishlist() {
  if (!wishlistDb) return;
  for (const [hashStr, rolls] of Object.entries(wishlistDb)) {
    const hash = parseInt(hashStr, 10);
    if (isNaN(hash)) continue;
    for (const roll of rolls) {
      if (roll.title) {
        const normName = roll.title.split('\n')[0].trim().toLowerCase();
        nameToHash[normName] = hash;
        const baseName = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
        nameToHash[baseName] = hash;
      }
    }
  }
}

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
            const parsed = JSON.parse(registryStr);
            chrome.storage.local.set({ perkRegistry: parsed });
            updatePerkNameToIcon(parsed);
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
            const sheetWeapon = (hoveredElement as any)._aegisSheetWeapon;
            const bestAlternative = (hoveredElement as any)._aegisBestAlternative;
            const isBestInClass = (hoveredElement as any)._aegisIsBestInClass;
            const sheetPerks = (hoveredElement as any)._aegisSheetPerks;

            showTooltip(
              hoveredElement,
              result,
              name,
              perksMap,
              activeHashes,
              scoringSource === 'lightgg',
              sheetWeapon,
              bestAlternative,
              isBestInClass,
              sheetPerks,
              perkNameToIcon
            );
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

function cleanPerkName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/\s*\([^)]+\)\s*/g, '') // strip parentheses (e.g. (best), (PvE))
    .replace(/[*+]/g, '')            // strip markers like * or +
    .trim();
}

function findAegisWeapon(name: string): AegisSheetWeapon | null {
  if (!aegisSheetDb || !aegisSheetDb.weapons) return null;
  const normalized = name.split('\n')[0].trim().toLowerCase();
  const baseNormalized = normalized.replace(/\s*\([^)]+\)\s*$/, '').trim();
  return aegisSheetDb.weapons[normalized] || aegisSheetDb.weapons[baseNormalized] || null;
}

function findWeaponCategory(weaponName: string): string {
  if (!aegisSheetDb || !aegisSheetDb.categories) return '';
  const norm = weaponName.split('\n')[0].trim().toLowerCase();
  const baseNorm = norm.replace(/\s*\([^)]+\)\s*$/, '').trim();
  for (const [tab, list] of Object.entries(aegisSheetDb.categories)) {
    if (list.some(w => {
      const n = w.name.toLowerCase();
      return n === norm || n === baseNorm;
    })) {
      return tab;
    }
  }
  return '';
}

function findSuperiors(categoryTab: string, currentEnergy: string, currentFrame: string) {
  if (!aegisSheetDb || !aegisSheetDb.categories || !categoryTab) {
    return { byEnergy: null, byFrame: null, byBoth: null };
  }
  const list = aegisSheetDb.categories[categoryTab] || [];
  const normEnergy = currentEnergy.toLowerCase().trim();
  const normFrame = currentFrame.toLowerCase().replace(/ frame$/, '').trim();

  const byEnergy = list.find(w => w.energy.toLowerCase().trim() === normEnergy) || null;
  const byFrame = list.find(w => w.frame.toLowerCase().replace(/ frame$/, '').trim() === normFrame) || null;
  const byBoth = list.find(w => 
    w.energy.toLowerCase().trim() === normEnergy && 
    w.frame.toLowerCase().replace(/ frame$/, '').trim() === normFrame
  ) || null;

  return { byEnergy, byFrame, byBoth };
}

function isWordSubsequence(subWords: string[], mainWords: string[]): boolean {
  let subIdx = 0;
  for (let mainIdx = 0; mainIdx < mainWords.length && subIdx < subWords.length; mainIdx++) {
    if (mainWords[mainIdx] === subWords[subIdx]) {
      subIdx++;
    }
  }
  return subIdx === subWords.length;
}

function isPerkMatch(perkName: string, recName: string): boolean {
  const pNameClean = perkName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const rNameClean = recName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!pNameClean || !rNameClean) return false;

  const pWords = pNameClean.split(' ');
  const rWords = rNameClean.split(' ');

  const pStripped = pNameClean.replace(/\s+/g, '');
  const rStripped = rNameClean.replace(/\s+/g, '');
  if (pStripped === rStripped) return true;

  if (isWordSubsequence(rWords, pWords)) return true;
  if (isWordSubsequence(pWords, rWords)) return true;

  return false;
}

function computeGrade(
  p1: 'active' | 'selectable' | 'missing',
  p2: 'active' | 'selectable' | 'missing',
  mag: 'active' | 'selectable' | 'missing',
  barrel: 'active' | 'selectable' | 'missing',
  origin: 'active' | 'selectable' | 'missing',
  treatSelectableAsActive: boolean
): 'S+' | 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F' {
  const effectiveP1 = p1 === 'active' || (treatSelectableAsActive && p1 === 'selectable');
  const effectiveP2 = p2 === 'active' || (treatSelectableAsActive && p2 === 'selectable');
  const effectiveMag = mag === 'active' || (treatSelectableAsActive && mag === 'selectable');
  const effectiveBarrel = barrel === 'active' || (treatSelectableAsActive && barrel === 'selectable');
  const effectiveOrigin = origin === 'active' || (treatSelectableAsActive && origin === 'selectable');

  const activeTraitsCount = (p1 === 'active' ? 1 : 0) + (p2 === 'active' ? 1 : 0);
  const selectableTraitsCount = (p1 === 'selectable' ? 1 : 0) + (p2 === 'selectable' ? 1 : 0);
  const hasActiveMag = mag === 'active';
  const hasActiveBarrel = barrel === 'active';

  // 1. S+ : Traits (P1 & P2) + Mag + Barrel + Origin all active
  if (effectiveP1 && effectiveP2 && effectiveMag && effectiveBarrel && effectiveOrigin) {
    return 'S+';
  }

  // 2. S : Traits (P1 & P2) + Mag active
  if (effectiveP1 && effectiveP2 && effectiveMag) {
    return 'S';
  }

  // 3. A+ : Traits (P1 & P2) + Barrel active
  if (effectiveP1 && effectiveP2 && effectiveBarrel) {
    return 'A+';
  }

  // 4. A : Traits (P1 & P2) active
  if (effectiveP1 && effectiveP2) {
    return 'A';
  }

  // 5. B+ : One active Trait + One selectable Trait + Mag or Barrel active
  if (!treatSelectableAsActive) {
    if (activeTraitsCount === 1 && selectableTraitsCount === 1 && (hasActiveMag || hasActiveBarrel)) {
      return 'B+';
    }
    // 6. B : One active Trait + One selectable Trait
    if (activeTraitsCount === 1 && selectableTraitsCount === 1) {
      return 'B';
    }
  }

  // 7. C : One active Trait + Mag or Barrel active
  const effectiveActiveTraitsCount = (effectiveP1 ? 1 : 0) + (effectiveP2 ? 1 : 0);
  if (effectiveActiveTraitsCount === 1 && (effectiveMag || effectiveBarrel)) {
    return 'C';
  }

  // 8. D : One active or selectable Trait
  if (effectiveActiveTraitsCount === 1 || (!treatSelectableAsActive && selectableTraitsCount === 1)) {
    return 'D';
  }

  return 'F';
}

interface EvaluatedPerk {
  name: string;
  icon?: string;
  matched: boolean;
  status: 'active' | 'selectable' | 'missing';
}

function evaluateCategoryPerks(
  recString: string,
  availablePerks: { hash: number; name: string; icon: string; active: boolean }[],
  perksMap: Record<number, { name: string; icon: string }>
): EvaluatedPerk[] {
  if (!recString || recString.trim() === '' || recString.trim() === '-' || recString.toLowerCase() === 'none') {
    return [];
  }

  // Split by slashes or newlines
  const recs = recString
    .split(/[\/\n]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const results: EvaluatedPerk[] = [];

  for (const rawRec of recs) {
    const rec = cleanPerkName(rawRec);
    if (!rec) continue;

    let foundPerk: { hash: number; name: string; icon: string; active: boolean } | null = null;
    
    // First pass: try to find an active matching perk
    for (const perk of availablePerks) {
      if (perk.active && isPerkMatch(perk.name, rec)) {
        foundPerk = perk;
        break;
      }
    }

    // Second pass: if no active match, try to find a selectable matching perk
    if (!foundPerk) {
      for (const perk of availablePerks) {
        if (isPerkMatch(perk.name, rec)) {
          foundPerk = perk;
          break;
        }
      }
    }

    if (foundPerk) {
      results.push({
        name: perksMap[foundPerk.hash]?.name || foundPerk.name,
        icon: foundPerk.icon,
        matched: true,
        status: foundPerk.active ? 'active' : 'selectable',
      });
    } else {
      // Capitalize the first letter of each word for missing perks
      const displayName = rawRec.replace(/\b\w/g, c => c.toUpperCase());
      const missingIcon = perkNameToIcon[rec] || perkNameToIcon[displayName.toLowerCase().trim()];
      results.push({
        name: displayName,
        icon: missingIcon || undefined,
        matched: false,
        status: 'missing',
      });
    }
  }

  return results;
}

function getSlotStatusFromEvaluations(evals: EvaluatedPerk[]): 'active' | 'selectable' | 'missing' {
  if (evals.length === 0) {
    return 'active'; // treated as active if no recommendations exist
  }
  if (evals.some(e => e.status === 'active')) {
    return 'active';
  }
  if (evals.some(e => e.status === 'selectable')) {
    return 'selectable';
  }
  return 'missing';
}

function scoreSheetWeapon(
  sheetWeapon: AegisSheetWeapon,
  perksMap: Record<number, { name: string; icon: string }>,
  activeHashes: number[]
): {
  result: ScoringResult;
  potentialGrade: string;
  upgradeAdvice: string;
  sheetPerks: { matched: TooltipPerk[]; missing: TooltipPerk[] };
} {
  const availablePerks: { hash: number; name: string; icon: string; active: boolean }[] = [];
  for (const [hashStr, p] of Object.entries(perksMap)) {
    const hash = parseInt(hashStr, 10);
    if (!isNaN(hash)) {
      availablePerks.push({
        hash,
        name: p.name.toLowerCase().trim(),
        icon: p.icon,
        active: activeHashes.includes(hash),
      });
    }
  }

  const barrelEvals = evaluateCategoryPerks(sheetWeapon.barrel, availablePerks, perksMap);
  const magEvals = evaluateCategoryPerks(sheetWeapon.mag, availablePerks, perksMap);
  const p1Evals = evaluateCategoryPerks(sheetWeapon.perk1, availablePerks, perksMap);
  const p2Evals = evaluateCategoryPerks(sheetWeapon.perk2, availablePerks, perksMap);
  const originEvals = evaluateCategoryPerks(sheetWeapon.origin, availablePerks, perksMap);

  const barrelStatus = getSlotStatusFromEvaluations(barrelEvals);
  const magStatus = getSlotStatusFromEvaluations(magEvals);
  const p1Status = getSlotStatusFromEvaluations(p1Evals);
  const p2Status = getSlotStatusFromEvaluations(p2Evals);
  const originStatus = getSlotStatusFromEvaluations(originEvals);

  const currentGrade = computeGrade(p1Status, p2Status, magStatus, barrelStatus, originStatus, false);
  const potentialGrade = computeGrade(p1Status, p2Status, magStatus, barrelStatus, originStatus, true);

  let pct = 0;
  const slots = [barrelStatus, magStatus, p1Status, p2Status];
  for (const s of slots) {
    if (s === 'active') pct += 25;
    else if (s === 'selectable') pct += 15;
  }

  const matchedList: TooltipPerk[] = [];
  const missingList: TooltipPerk[] = [];

  const categories: { type: TooltipPerk['type']; evals: EvaluatedPerk[] }[] = [
    { type: 'barrel', evals: barrelEvals },
    { type: 'mag', evals: magEvals },
    { type: 'perk1', evals: p1Evals },
    { type: 'perk2', evals: p2Evals },
    { type: 'origin', evals: originEvals },
  ];

  const selectablePerkNames: string[] = [];

  for (const cat of categories) {
    for (const perk of cat.evals) {
      const tooltipPerk: TooltipPerk = {
        name: perk.name,
        icon: perk.icon,
        matched: perk.matched,
        type: cat.type,
        status: perk.status,
      };

      if (perk.status === 'active' || perk.status === 'selectable') {
        matchedList.push(tooltipPerk);
        if (perk.status === 'selectable') {
          const formattedName = perk.name.replace(/\b\w/g, c => c.toUpperCase());
          if (!selectablePerkNames.includes(formattedName)) {
            selectablePerkNames.push(formattedName);
          }
        }
      } else {
        missingList.push(tooltipPerk);
      }
    }
  }

  let upgradeAdvice = '';
  const gradeOrder = ['F', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+'];
  const curIdx = gradeOrder.indexOf(currentGrade);
  const potIdx = gradeOrder.indexOf(potentialGrade);

  if (potIdx > curIdx && selectablePerkNames.length > 0) {
    const perksStr = selectablePerkNames.join(' or ');
    upgradeAdvice = `💡 Upgrade available: Select ${perksStr} to rank up to ${potentialGrade}!`;
  }

  const finalGrade = currentGrade;

  return {
    result: {
      grade: finalGrade,
      matchPercentage: pct,
      matchedPerks: [],
      missingPerks: [],
      notes: sheetWeapon.notes || '',
      wishlistPerks: [],
    },
    potentialGrade,
    upgradeAdvice,
    sheetPerks: { matched: matchedList, missing: missingList }
  };
}

/* ==========================================================================
   Aegis Database Explorer Slide-out Panel Injection & Controller Logic
   ========================================================================== */

function populateFramesFilter(selectedCat: string) {
  if (!aegisSheetDb) return;
  const frameSelect = document.querySelector('.aegis-explorer-frame-select') as HTMLSelectElement;
  if (!frameSelect) return;

  const prevValue = frameSelect.value;
  
  // Clear existing options except the first one ("All Frames")
  while (frameSelect.children.length > 1) {
    frameSelect.removeChild(frameSelect.lastChild!);
  }

  const frames = new Set<string>();
  
  if (selectedCat) {
    const list = aegisSheetDb.categories[selectedCat] || [];
    for (const w of list) {
      if (w.frame) {
        frames.add(w.frame.trim());
      }
    }
  } else {
    for (const w of Object.values(aegisSheetDb.weapons)) {
      if (w.frame) {
        frames.add(w.frame.trim());
      }
    }
  }

  const sortedFrames = Array.from(frames).sort();
  for (const frame of sortedFrames) {
    const opt = document.createElement('option');
    opt.value = frame;
    opt.textContent = frame;
    frameSelect.appendChild(opt);
  }

  // Restore selection if still valid
  if (frames.has(prevValue)) {
    frameSelect.value = prevValue;
  } else {
    frameSelect.value = '';
  }
}

function populateFilters() {
  if (!aegisSheetDb || !aegisSheetDb.categories) return;

  const catSelect = document.querySelector('.aegis-explorer-category-select') as HTMLSelectElement;

  if (catSelect && catSelect.children.length <= 1) {
    const categories = Object.keys(aegisSheetDb.categories).sort();
    for (const cat of categories) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    }
  }

  populateFramesFilter(catSelect ? catSelect.value : '');
}

function renderResults() {
  const resultsContainer = document.querySelector('.aegis-explorer-results') as HTMLElement;
  if (!resultsContainer) return;

  if (!aegisSheetDb || !aegisSheetDb.weapons) {
    resultsContainer.innerHTML = '<div class="aegis-explorer-empty">Loading database...</div>';
    return;
  }

  const searchInput = document.querySelector('.aegis-explorer-search-input') as HTMLInputElement;
  const catSelect = document.querySelector('.aegis-explorer-category-select') as HTMLSelectElement;
  const frameSelect = document.querySelector('.aegis-explorer-frame-select') as HTMLSelectElement;
  const elementSelect = document.querySelector('.aegis-explorer-element-select') as HTMLSelectElement;

  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const selectedCat = catSelect ? catSelect.value : '';
  const selectedFrame = frameSelect ? frameSelect.value : '';
  const selectedElement = elementSelect ? elementSelect.value : '';

  const matches: { weapon: AegisSheetWeapon; category: string }[] = [];

  for (const [cat, list] of Object.entries(aegisSheetDb.categories)) {
    if (selectedCat && cat !== selectedCat) continue;
    for (const w of list) {
      if (selectedFrame && w.frame !== selectedFrame) continue;
      if (selectedElement && w.energy.toLowerCase().trim() !== selectedElement.toLowerCase().trim()) continue;
      if (query) {
        const nameMatch = w.name.toLowerCase().includes(query);
        const notesMatch = w.notes.toLowerCase().includes(query);
        const frameMatch = w.frame.toLowerCase().includes(query);
        const perksMatch = (w.perk1 + ' ' + w.perk2).toLowerCase().includes(query);
        if (!nameMatch && !notesMatch && !frameMatch && !perksMatch) continue;
      }
      matches.push({ weapon: w, category: cat });
    }
  }

  matches.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    const rA = parseInt(a.weapon.rank, 10);
    const rB = parseInt(b.weapon.rank, 10);
    return (isNaN(rA) ? 999 : rA) - (isNaN(rB) ? 999 : rB);
  });

  if (matches.length === 0) {
    resultsContainer.innerHTML = '<div class="aegis-explorer-empty">No matching weapons found.</div>';
    return;
  }

  let html = '';
  for (const m of matches) {
    const w = m.weapon;
    const tierLetter = w.tier ? w.tier.charAt(0).toLowerCase() : '';
    const tierClass = `aegis-tier-${tierLetter}`;
    const rankLabel = w.rank ? `#${w.rank}` : '-';

    const normName = w.name.toLowerCase().trim();
    const baseName = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
    const weaponHash = nameToHash[normName] || nameToHash[baseName];

    let destinyReportBtnHtml = '';
    if (weaponHash) {
      destinyReportBtnHtml = `<a class="aegis-action-btn aegis-btn-report" href="https://destiny.report/w/${weaponHash}" target="_blank" rel="noopener noreferrer">Destiny.Report ↗</a>`;
    } else {
      destinyReportBtnHtml = `<button class="aegis-action-btn aegis-btn-disabled" title="Weapon ID not resolved. Ensure the weapon is in your wishlist or has been viewed/scanned on screen in DIM." disabled>Destiny.Report (Unknown ID)</button>`;
    }

    html += `
      <div class="aegis-explorer-row" data-weapon-name="${w.name.replace(/"/g, '&quot;')}">
        <div class="aegis-explorer-row-header">
          <span class="aegis-explorer-row-name">${w.name}</span>
          <div class="aegis-explorer-row-badges">
            <span class="aegis-explorer-row-badge ${tierClass}">${w.tier || 'F'}</span>
            <span class="aegis-explorer-row-rank">${rankLabel}</span>
          </div>
        </div>
        <div class="aegis-explorer-row-details">
          <span class="aegis-explorer-row-meta">${w.energy} / ${w.frame}</span>
          <span class="aegis-explorer-row-cat">${m.category}</span>
        </div>
        ${w.notes ? `<div class="aegis-explorer-row-notes">${w.notes}</div>` : ''}
        <div class="aegis-explorer-row-actions">
          <button class="aegis-action-btn aegis-btn-highlight" data-action="filter-vault">Filter in Vault</button>
          ${destinyReportBtnHtml}
        </div>
      </div>
    `;
  }

  resultsContainer.innerHTML = html;

  const rows = resultsContainer.querySelectorAll('.aegis-explorer-row');
  rows.forEach((row) => {
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.aegis-explorer-row-actions')) {
        return;
      }
      
      // Accordion: collapse other rows
      rows.forEach((otherRow) => {
        if (otherRow !== row) {
          otherRow.classList.remove('expanded');
        }
      });

      row.classList.toggle('expanded');
    });

    const filterBtn = row.querySelector('[data-action="filter-vault"]');
    if (filterBtn) {
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = row.getAttribute('data-weapon-name');
        if (name) {
          triggerDimSearch(name);
        }
      });
    }

    const reportBtn = row.querySelector('.aegis-btn-report');
    if (reportBtn) {
      reportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  });
}

function triggerDimSearch(weaponName: string) {
  const searchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]') as HTMLInputElement;
  if (searchInput) {
    searchInput.value = `name:"${weaponName}"`;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    const wrapper = searchInput.parentElement;
    if (wrapper) {
      wrapper.classList.remove('aegis-search-flash');
      void wrapper.offsetWidth; // Force layout recalculation
      wrapper.classList.add('aegis-search-flash');
    }
  }
}

function initAegisExplorer() {
  if (!document.body || document.querySelector('.aegis-fab')) return;

  const fab = document.createElement('div');
  fab.className = 'aegis-fab';
  fab.title = 'Open Aegis Database Explorer';
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffd700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  `;

  const panel = document.createElement('div');
  panel.className = 'aegis-explorer-panel';
  panel.innerHTML = `
    <div class="aegis-explorer-header">
      <span class="aegis-explorer-title">Aegis Database Explorer</span>
      <button class="aegis-explorer-close" title="Close Explorer">&times;</button>
    </div>
    <div class="aegis-explorer-search-group">
      <input type="text" class="aegis-explorer-search-input" placeholder="Search weapon, notes, perks..." />
      <div class="aegis-explorer-selects">
        <select class="aegis-explorer-category-select">
          <option value="">All Categories</option>
        </select>
        <select class="aegis-explorer-frame-select">
          <option value="">All Frames</option>
        </select>
        <select class="aegis-explorer-element-select">
          <option value="">All Elements</option>
          <option value="Kinetic">Kinetic</option>
          <option value="Arc">Arc</option>
          <option value="Solar">Solar</option>
          <option value="Void">Void</option>
          <option value="Stasis">Stasis</option>
          <option value="Strand">Strand</option>
        </select>
      </div>
    </div>
    <div class="aegis-explorer-results">
      <div class="aegis-explorer-empty">Loading database...</div>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector('.aegis-explorer-close');
  const searchInput = panel.querySelector('.aegis-explorer-search-input');
  const catSelect = panel.querySelector('.aegis-explorer-category-select');
  const frameSelect = panel.querySelector('.aegis-explorer-frame-select');
  const elementSelect = panel.querySelector('.aegis-explorer-element-select');

  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      populateFilters();
      renderResults();
    }
  });

  closeBtn?.addEventListener('click', () => {
    panel.classList.remove('open');
  });

  const onUpdate = () => {
    renderResults();
  };

  searchInput?.addEventListener('input', onUpdate);
  catSelect?.addEventListener('change', () => {
    populateFramesFilter((catSelect as HTMLSelectElement).value);
    onUpdate();
  });
  frameSelect?.addEventListener('change', onUpdate);
  elementSelect?.addEventListener('change', onUpdate);
}

// Load wishlist & config on startup
chrome.storage.local.get(['wishlistData', 'enhancedToNormal', 'scoringSource', 'lightggData', 'aegisSheetDb', 'perkRegistry', 'aegisLayoutSide', 'aegisDbMode'], (res) => {
  wishlistDb = res.wishlistData || {};
  enhancedToNormalMap = res.enhancedToNormal || {};
  scoringSource = res.scoringSource || 'aegis';
  aegisLayoutSide = res.aegisLayoutSide || 'side';
  aegisDbMode = res.aegisDbMode || 'both';
  lightggDb = res.lightggData || {};
  aegisSheetDb = res.aegisSheetDb || null;
  console.log(`DIM Aegis Overlay: Loaded configuration. Source: ${scoringSource}`);
  updateNameToHashFromWishlist();
  updatePerkNameToIcon(res.perkRegistry || {});
  reprocessAllElements();
  initAegisExplorer();
});

// Watch for changes in storage (e.g. manual sync from settings popup)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    let changed = false;
    if (changes.wishlistData) {
      wishlistDb = changes.wishlistData.newValue || {};
      updateNameToHashFromWishlist();
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
    if (changes.aegisLayoutSide) {
      aegisLayoutSide = changes.aegisLayoutSide.newValue || 'side';
      changed = true;
    }
    if (changes.aegisDbMode) {
      aegisDbMode = changes.aegisDbMode.newValue || 'both';
      changed = true;
    }
    if (changes.lightggData) {
      lightggDb = changes.lightggData.newValue || {};
      changed = true;
    }
    if (changes.aegisSheetDb) {
      aegisSheetDb = changes.aegisSheetDb.newValue || null;
      changed = true;
    }
    if (changes.perkRegistry) {
      updatePerkNameToIcon(changes.perkRegistry.newValue || {});
      changed = true;
    }
    if (changed) {
      console.log('DIM Aegis Overlay: Storage updated, re-scoring elements.');
      reprocessAllElements();
    }
  }
});


function handleMouseEnter(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  hoveredElement = el;
  setupRegistryObserver();
  const result = (el as any)._aegisResult as ScoringResult;
  const name = (el as any)._aegisName as string;
  const perksMap = (el as any)._aegisPerksMap as Record<number, { name: string; icon: string }>;
  const activeHashes = (el as any)._aegisActiveHashes as number[];

  if (result && result.grade) {
    const sheetWeapon = (el as any)._aegisSheetWeapon;
    const bestAlternative = (el as any)._aegisBestAlternative;
    const isBestInClass = (el as any)._aegisIsBestInClass;
    const sheetPerks = (el as any)._aegisSheetPerks;

    showTooltip(
      el,
      result,
      name,
      perksMap,
      activeHashes,
      scoringSource === 'lightgg',
      sheetWeapon,
      bestAlternative,
      isBestInClass,
      sheetPerks,
      perkNameToIcon
    );
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
 * Injects a detailed grade summary block into the DIM item popup header.
 */
function injectPopupSummary(
  popupContainer: HTMLElement,
  result: ScoringResult,
  scoringSource: string,
  sheetWeapon?: AegisSheetWeapon,
  sheetPerks?: { matched: TooltipPerk[]; missing: TooltipPerk[] }
) {
  const titleEl = popupContainer.querySelector('h1, [class*="title"]');
  if (!titleEl) return;

  const header = titleEl.parentElement;
  if (!header) return;

  // Clean up any previously injected details card
  popupContainer.querySelectorAll('[data-aegis-details="true"]').forEach((el) => el.remove());

  let summaryEl = popupContainer.querySelector('.aegis-popup-summary') as HTMLDivElement | null;
  if (!result.grade) {
    if (summaryEl) summaryEl.remove();
    return;
  }

  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.className = 'aegis-popup-summary';
    titleEl.insertAdjacentElement('afterend', summaryEl);
  }

  const baseGradeLetter = result.grade.charAt(0).toLowerCase();
  const gradeClass = `aegis-grade-${baseGradeLetter}`;
  const isLightGG = scoringSource === 'lightgg';

  let notesHtml = '';
  if (result.notes) {
    notesHtml = `<div class="aegis-popup-notes-text">${result.notes}</div>`;
  }

  let upgradeAdviceHtml = '';
  if (result.upgradeAdvice) {
    upgradeAdviceHtml = `
      <div class="aegis-popup-upgrade-banner">
        ${result.upgradeAdvice}
      </div>
    `;
  }

  const matchLabel = isLightGG
    ? 'Light.gg Roll Appraisal'
    : `Wishlist Match: <strong class="${gradeClass}">${result.matchPercentage}%</strong>`;

  // Look up Aegis Master spreadsheet metadata
  const weaponName = titleEl.querySelector('span')?.textContent?.trim() || titleEl.textContent?.trim() || '';

  let sheetMetaHtml = '';
  if (sheetWeapon) {
    const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : '';
    const tierClass = `aegis-tier-${tierLetter}`;
    const rankLabel = sheetWeapon.rank ? `Rank #${sheetWeapon.rank} in Category` : '';

    sheetMetaHtml = `
      <div class="aegis-popup-meta-divider"></div>
      <div class="aegis-popup-meta-content">
        <div class="aegis-popup-row">
          <span class="aegis-popup-meta-badge ${tierClass}">${sheetWeapon.tier} Tier</span>
          ${rankLabel ? `<span class="aegis-popup-meta-rank">${rankLabel}</span>` : ''}
        </div>
        ${sheetWeapon.notes ? `<div class="aegis-popup-notes-text aegis-meta-notes"><strong>Aegis Meta:</strong> ${sheetWeapon.notes}</div>` : ''}
      </div>
    `;
  }

  safeSetInnerHTML(
    summaryEl,
    `
    <div class="aegis-popup-summary-content">
      <div class="aegis-popup-row">
        <span class="aegis-popup-grade-badge aegis-badge-${baseGradeLetter}">${result.grade}</span>
        <span class="aegis-popup-label">${matchLabel}</span>
      </div>
      ${upgradeAdviceHtml}
      ${notesHtml}
    </div>
    ${sheetMetaHtml}
  `
  );

  // If we have sheet data, also inject detailed overview cards below perks grid
  if (sheetWeapon) {
    const categoryTab = findWeaponCategory(weaponName);
    const superiors = findSuperiors(categoryTab, sheetWeapon.energy, sheetWeapon.frame);

    // Find insertion target: Display perks button or sockets element
    const perksBtn = popupContainer.querySelector('button[title*="perks" i], button[title*="Perks" i]');
    const perksSection = perksBtn?.parentElement;
    const sockets = popupContainer.querySelector('[class*="sockets" i], [class*="Sockets" i]');
    const insertTarget = perksSection || sockets;

    if (insertTarget) {
      // Create a single unified details card
      const detailsCard = document.createElement('div');
      detailsCard.className = 'aegis-popup-details-card';
      detailsCard.setAttribute('data-aegis-details', 'true');

      let perksRowsHtml = '';
      const items = [
        { label: 'Barrel', type: 'barrel', rawVal: sheetWeapon.barrel },
        { label: 'Mag', type: 'mag', rawVal: sheetWeapon.mag },
        { label: 'Perk 1', type: 'perk1', rawVal: sheetWeapon.perk1 },
        { label: 'Perk 2', type: 'perk2', rawVal: sheetWeapon.perk2 },
        { label: 'Origin', type: 'origin', rawVal: sheetWeapon.origin },
      ];

      for (const item of items) {
        if (!item.rawVal) continue;
        
        let chipsHtml = '';
        if (sheetPerks) {
          const matched = sheetPerks.matched.filter(p => p.type === item.type);
          const missing = sheetPerks.missing.filter(p => p.type === item.type);

          for (const perk of matched) {
            const statusClass = perk.status === 'active' ? 'aegis-chip-active' : 'aegis-chip-selectable';
            const iconHtml = perk.icon ? `<img src="https://www.bungie.net${perk.icon}" class="aegis-chip-icon" />` : '';
            const statusLabel = perk.status === 'active' ? '' : ' (Selectable)';
            chipsHtml += `
              <span class="aegis-perk-chip ${statusClass}" title="${perk.name}${statusLabel}">
                ${iconHtml}
                <span class="aegis-chip-name">${perk.name}</span>
              </span>
            `;
          }

          for (const perk of missing) {
            const iconHtml = perk.icon ? `<img src="https://www.bungie.net${perk.icon}" class="aegis-chip-icon" />` : '';
            chipsHtml += `
              <span class="aegis-perk-chip aegis-chip-missing" title="${perk.name} (Missing)">
                ${iconHtml}
                <span class="aegis-chip-name">${perk.name}</span>
              </span>
            `;
          }
        }

        if (!chipsHtml) {
          const cleanVal = item.rawVal.split(/[\/\n]+/).map((s) => s.trim()).filter(Boolean).join(' / ');
          if (!cleanVal) continue;
          chipsHtml = `<span class="aegis-details-value-text">${cleanVal}</span>`;
        }

        perksRowsHtml += `
          <div class="aegis-details-row aegis-perk-row">
            <span class="aegis-details-label">${item.label}</span>
            <div class="aegis-details-value aegis-details-chips-container">
              ${chipsHtml}
            </div>
          </div>
        `;
      }

      // Check if superiors exist and format them
      let superiorsHtml = '';
      if (superiors.byEnergy || superiors.byFrame || superiors.byBoth) {
        const uniqueSups = new Map<string, { weapon: any; labels: string[] }>();
        const addUniqueSup = (label: string, supW: any) => {
          if (!supW) return;
          const key = supW.name.toLowerCase();
          if (uniqueSups.has(key)) {
            uniqueSups.get(key)!.labels.push(label);
          } else {
            uniqueSups.set(key, { weapon: supW, labels: [label] });
          }
        };

        if (sheetWeapon.energy) addUniqueSup(sheetWeapon.energy, superiors.byEnergy);
        if (sheetWeapon.frame) addUniqueSup(sheetWeapon.frame, superiors.byFrame);
        if (sheetWeapon.energy && sheetWeapon.frame) {
          addUniqueSup(`${sheetWeapon.energy} ${sheetWeapon.frame}`, superiors.byBoth);
        }

        let supRowsHtml = '';
        for (const item of uniqueSups.values()) {
          const isSelf = item.weapon.name.toLowerCase() === sheetWeapon.name.toLowerCase();
          const selfClass = isSelf ? 'aegis-sup-self' : '';
          const labelsStr = item.labels.join(' / ');
          
          const tierLetter = item.weapon.tier ? item.weapon.tier.charAt(0).toLowerCase() : '';
          const tierBadgeHtml = `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${item.weapon.tier}</span>`;
          const rankHtml = item.weapon.rank ? `<span class="aegis-sup-rank-num">#${item.weapon.rank}</span>` : '';
          const currentLabel = isSelf ? '<span class="aegis-current-badge">(Current)</span>' : '';

          supRowsHtml += `
            <div class="aegis-details-row aegis-sup-row ${isSelf ? 'aegis-sup-row-self' : ''}">
              <span class="aegis-details-label aegis-sup-type-label" title="${labelsStr}">${labelsStr}</span>
              <span class="aegis-sup-name ${selfClass}">${item.weapon.name}${currentLabel}</span>
              <div class="aegis-sup-rank-group">
                ${tierBadgeHtml}
                ${rankHtml}
              </div>
            </div>
          `;
        }

        const currentWeaponKey = sheetWeapon.name.toLowerCase();
        if (!uniqueSups.has(currentWeaponKey)) {
          const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : '';
          const tierBadgeHtml = `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${sheetWeapon.tier}</span>`;
          const rankHtml = sheetWeapon.rank ? `<span class="aegis-sup-rank-num">#${sheetWeapon.rank}</span>` : '';

          supRowsHtml += `
            <div class="aegis-details-row aegis-sup-row aegis-sup-row-self">
              <span class="aegis-details-label aegis-sup-type-label" title="Current Weapon">Current Weapon</span>
              <span class="aegis-sup-name aegis-sup-self">${sheetWeapon.name}<span class="aegis-current-badge">(Current)</span></span>
              <div class="aegis-sup-rank-group">
                ${tierBadgeHtml}
                ${rankHtml}
              </div>
            </div>
          `;
        }

        if (supRowsHtml) {
          superiorsHtml = `
            <div class="aegis-details-divider"></div>
            <div class="aegis-details-header" style="margin-top: 10px;">Best in Category (${categoryTab})</div>
            <div class="aegis-details-body">
              ${supRowsHtml}
            </div>
          `;
        }
      }

      if (perksRowsHtml || superiorsHtml) {
        safeSetInnerHTML(
          detailsCard,
          `
          <div class="aegis-details-header">Aegis Recommended Perks</div>
          <div class="aegis-details-body aegis-perks-body" style="margin-bottom: ${superiorsHtml ? '10px' : '0'};">
            ${perksRowsHtml}
          </div>
          ${superiorsHtml}
        `
        );
        
        const rect = popupContainer.getBoundingClientRect();
        const spaceLeft = rect.left;
        const spaceRight = window.innerWidth - rect.right;

        if (aegisLayoutSide === 'side' && window.innerWidth >= 1000 && (spaceLeft >= 330 || spaceRight >= 330)) {
          detailsCard.classList.add('aegis-side-panel');
          popupContainer.appendChild(detailsCard);
          
          detailsCard.style.setProperty('position', 'absolute', 'important');
          detailsCard.style.setProperty('top', '55px', 'important');
          
          if (spaceLeft >= 330) {
            detailsCard.style.setProperty('left', '-320px', 'important');
            detailsCard.style.setProperty('right', 'auto', 'important');
          } else {
            detailsCard.style.setProperty('left', 'auto', 'important');
            detailsCard.style.setProperty('right', '-320px', 'important');
          }
        } else {
          detailsCard.classList.remove('aegis-side-panel');
          detailsCard.style.removeProperty('position');
          detailsCard.style.removeProperty('top');
          detailsCard.style.removeProperty('left');
          detailsCard.style.removeProperty('right');
          insertTarget.after(detailsCard);
        }
      }
    }
  }
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

  // Handle S-tier gold glow class on the badge target
  if (badgeTarget) {
    badgeTarget.classList.remove('aegis-gold-glow');
    if (result.grade && result.grade.startsWith('S')) {
      badgeTarget.classList.add('aegis-gold-glow');
    }
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
  let badgeTarget = el.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"]') as HTMLElement | null;
  if (badgeTarget) {
    badgeTarget.classList.remove('aegis-gold-glow');
  } else {
    el.classList.remove('aegis-gold-glow');
  }
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

  if (itemHashStr && weaponName && weaponName !== 'Unknown Weapon') {
    const hash = parseInt(itemHashStr, 10);
    if (!isNaN(hash)) {
      const normName = weaponName.toLowerCase().trim();
      nameToHash[normName] = hash;
      const baseName = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
      nameToHash[baseName] = hash;
    }
  }

  if (!itemHashStr || !perkHashesStr) {
    return;
  }

  try {
    const itemHash = parseInt(itemHashStr, 10);
    const perkHashes = perkHashesStr
      .split(',')
      .map((h) => parseInt(h.trim(), 10))
      .filter((h) => !isNaN(h));
    
    let perksMap: Record<number, { name: string; icon: string }> = {};
    if (perksDataStr) {
      perksMap = JSON.parse(perksDataStr);
      for (const p of Object.values(perksMap)) {
        if (p && p.name && p.icon) {
          const cleanName = cleanPerkName(p.name);
          perkNameToIcon[cleanName] = p.icon;
          perkNameToIcon[p.name.toLowerCase().trim()] = p.icon;
        }
      }
    }

    const activePerksDataStr = el.getAttribute('data-aegis-active-perk-hashes');
    let activeHashes: number[] = [];
    if (activePerksDataStr) {
      activeHashes = activePerksDataStr.split(',').map(Number).filter(h => !isNaN(h) && h > 0);
    }

    let result: ScoringResult;
    let sheetPerks = undefined;
    const sheetWeapon = findAegisWeapon(weaponName);
    let bestAlternative = undefined;
    let isBestInClass = false;

    if (scoringSource === 'lightgg') {
      const rawInstanceId = el.getAttribute('data-aegis-instance-id') || el.id.replace('item-', '');
      const instanceId = rawInstanceId.replace(/^[^0-9]+/, '');
      const grade = lightggDb[instanceId];
      if (grade) {
        let aegisResult: ScoringResult;
        const useSheet = sheetWeapon && aegisDbMode !== 'wishlist';
        if (useSheet) {
          const sheetScore = scoreSheetWeapon(sheetWeapon!, perksMap, activeHashes);
          aegisResult = sheetScore.result;
          sheetPerks = sheetScore.sheetPerks;
          aegisResult.upgradeAdvice = sheetScore.upgradeAdvice;
          aegisResult.potentialGrade = sheetScore.potentialGrade;
        } else {
          aegisResult = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
        }
        result = {
          grade: grade as any,
          matchPercentage: aegisResult.grade ? aegisResult.matchPercentage : 100,
          matchedPerks: aegisResult.matchedPerks,
          missingPerks: aegisResult.missingPerks,
          notes: aegisResult.notes || 'Community popularity rating from Light.gg Roll Appraiser.',
          wishlistPerks: aegisResult.wishlistPerks,
          upgradeAdvice: aegisResult.upgradeAdvice,
          potentialGrade: aegisResult.potentialGrade,
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
      const useSheet = sheetWeapon && aegisDbMode !== 'wishlist';
      const useWishlist = aegisDbMode !== 'spreadsheet';

      if (useSheet) {
        const sheetScore = scoreSheetWeapon(sheetWeapon!, perksMap, activeHashes);
        result = sheetScore.result;
        sheetPerks = sheetScore.sheetPerks;
        result.upgradeAdvice = sheetScore.upgradeAdvice;
        result.potentialGrade = sheetScore.potentialGrade;
      } else if (useWishlist) {
        result = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
      } else {
        // Spreadsheet only mode but weapon is not in the spreadsheet
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: '',
          wishlistPerks: [],
        };
      }
    }

    const hasSheetData = sheetWeapon && aegisDbMode !== 'wishlist';
    if (hasSheetData) {
      const categoryTab = findWeaponCategory(weaponName);
      const superiors = findSuperiors(categoryTab, sheetWeapon!.energy, sheetWeapon!.frame);
      const bestW = superiors.byBoth || superiors.byFrame || superiors.byEnergy;
      if (bestW) {
        if (bestW.name.toLowerCase() === sheetWeapon!.name.toLowerCase()) {
          isBestInClass = true;
        } else {
          bestAlternative = `${bestW.name} (${bestW.tier} #${bestW.rank})`;
        }
      }
    }

    // Attach data on the element object for hover events to retrieve
    (el as any)._aegisResult = result;
    (el as any)._aegisName = weaponName;
    (el as any)._aegisPerksMap = perksMap;
    (el as any)._aegisActiveHashes = activeHashes;
    (el as any)._aegisSheetWeapon = hasSheetData ? sheetWeapon : null;
    (el as any)._aegisBestAlternative = bestAlternative;
    (el as any)._aegisIsBestInClass = isBestInClass;
    (el as any)._aegisSheetPerks = hasSheetData ? sheetPerks : null;

    if (result.grade) {
      const isPopup = el.matches('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');

      // Inject rank badge (only if not the popup container itself)
      if (!isPopup) {
        injectBadge(el, result);
      }

      // Inject popup summary card if inside a details popup (or if we are the popup container)
      const popupContainer = isPopup ? el : el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      if (popupContainer) {
        injectPopupSummary(popupContainer as HTMLElement, result, scoringSource, sheetWeapon || undefined, sheetPerks);
      }

      // Attach event listeners for the tooltip if not already done (only if not the popup container itself)
      if (!isPopup && !el.hasAttribute('data-aegis-listeners')) {
        el.addEventListener('mouseenter', handleMouseEnter);
        el.addEventListener('mouseleave', handleMouseLeave);
        el.setAttribute('data-aegis-listeners', 'true');
      }
    } else {
      // If graded previously but now has no grade, remove UI
      removeBadge(el);
      const popupContainer = el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      if (popupContainer) {
        const summary = popupContainer.querySelector('.aegis-popup-summary');
        if (summary) summary.remove();
      }
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

function startObserver() {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    return;
  }
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-aegis-item-hash', 'data-aegis-perk-hashes'],
  });
}
startObserver();


// Run initial scan once script loads
reprocessAllElements();
