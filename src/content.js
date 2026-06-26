import { scoreWeapon } from './scorer';
import { showTooltip, hideTooltip } from './tooltip';
/** Safely sets element HTML using DOMParser (avoids innerHTML linter warning). */
function safeSetInnerHTML(element, htmlString) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(htmlString, 'text/html');
    element.replaceChildren(...Array.from(parsed.body.childNodes));
}
function getGradeValue(grade) {
    const g = (grade || '').trim().toUpperCase();
    if (g.startsWith('S'))
        return 100;
    if (g === 'A+')
        return 90;
    if (g === 'A')
        return 85;
    if (g === 'B+')
        return 75;
    if (g === 'B')
        return 70;
    if (g === 'C+')
        return 60;
    if (g === 'C')
        return 55;
    if (g === 'D')
        return 45;
    if (g === 'PVP')
        return 40;
    if (g === 'E')
        return 30;
    if (g === 'F')
        return 10;
    return 0;
}
function findAegisArmorSet(itemName) {
    if (!aegisSheetDb || !aegisSheetDb.armor)
        return null;
    const normalizedName = itemName.toLowerCase().trim();
    // Try direct substring match first
    for (const [setName, data] of Object.entries(aegisSheetDb.armor)) {
        if (normalizedName.includes(setName)) {
            return data;
        }
    }
    // Fallback map for raid/dungeon sets with unique naming schemes
    const lowerName = normalizedName.replace(/[^a-z0-9\s]/g, '');
    if (lowerName.includes('kabr') ||
        lowerName.includes('hezen lord') ||
        lowerName.includes('prime zealot')) {
        return aegisSheetDb.armor["atheon's memory"] || null;
    }
    if (lowerName.includes('deathsinger') ||
        lowerName.includes('unyielding favor') ||
        lowerName.includes('will of the just')) {
        return aegisSheetDb.armor["crota's memory"] || null;
    }
    if (lowerName.includes('war numen') ||
        lowerName.includes('mouth of ur') ||
        lowerName.includes('doom of chelchis') ||
        lowerName.includes('chasm of yul')) {
        return aegisSheetDb.armor["oryx's memory"] || null;
    }
    if (lowerName.includes('tmcogburn') ||
        lowerName.includes('tmearp') ||
        lowerName.includes('tmmoss')) {
        return aegisSheetDb.armor["tm custom"] || null;
    }
    if (lowerName.includes('iron companion') ||
        lowerName.includes('iron forerunner') ||
        lowerName.includes('iron truage') ||
        lowerName.includes('iron remembrance') ||
        lowerName.includes('iron fellowship') ||
        lowerName.includes('iron pledge') ||
        lowerName.includes('iron symmachy') ||
        lowerName.includes('iron will')) {
        return aegisSheetDb.armor["iron panoply"] || aegisSheetDb.armor["iron battalion"] || null;
    }
    return null;
}
let wishlistDb = {};
let enhancedToNormalMap = {};
let scoringSource = 'aegis';
let aegisLayoutSide = 'side';
let aegisDbMode = 'both';
let aegisTwoTier = false;
let lightggDb = {};
let aegisSheetDb = null;
let hoveredElement = null;
let registryObserver = null;
let nameToHash = {};
let perkNameToIcon = {};
function updatePerkNameToIcon(perkRegistry) {
    if (!perkRegistry)
        return;
    for (const p of Object.values(perkRegistry)) {
        if (p && p.name && p.icon) {
            const cleanName = cleanPerkName(p.name);
            perkNameToIcon[cleanName] = p.icon;
            perkNameToIcon[p.name.toLowerCase().trim()] = p.icon;
        }
    }
}
function updateNameToHashFromWishlist() {
    if (!wishlistDb)
        return;
    for (const [hashStr, rolls] of Object.entries(wishlistDb)) {
        const hash = parseInt(hashStr, 10);
        if (isNaN(hash))
            continue;
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
    if (registryObserver)
        return;
    const registryEl = document.getElementById('aegis-global-perk-registry');
    if (!registryEl)
        return;
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
                    }
                    catch (e) {
                        // Ignore
                    }
                }
                if (hoveredElement) {
                    const result = hoveredElement._aegisResult;
                    const name = hoveredElement._aegisName;
                    const perksMap = hoveredElement._aegisPerksMap;
                    const activeHashes = hoveredElement._aegisActiveHashes;
                    if (result && result.grade) {
                        const sheetWeapon = hoveredElement._aegisSheetWeapon;
                        const bestAlternative = hoveredElement._aegisBestAlternative;
                        const isBestInClass = hoveredElement._aegisIsBestInClass;
                        const sheetPerks = hoveredElement._aegisSheetPerks;
                        showTooltip(hoveredElement, result, name, perksMap, activeHashes, scoringSource === 'lightgg', sheetWeapon, bestAlternative, isBestInClass, sheetPerks, perkNameToIcon);
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
function cleanPerkName(name) {
    return (name ?? '')
        .toLowerCase()
        .replace(/\s*\([^)]+\)\s*/g, '') // strip parentheses (e.g. (best), (PvE))
        .replace(/[*+]/g, '') // strip markers like * or +
        .trim();
}
function findAegisWeapon(name) {
    if (!aegisSheetDb || !aegisSheetDb.weapons)
        return null;
    const normalized = name.split('\n')[0].trim().toLowerCase();
    const baseNormalized = normalized.replace(/\s*\([^)]+\)\s*$/, '').trim();
    return aegisSheetDb.weapons[normalized] || aegisSheetDb.weapons[baseNormalized] || null;
}
function findWeaponCategory(weaponName) {
    if (!aegisSheetDb || !aegisSheetDb.categories)
        return '';
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
function findSuperiors(categoryTab, currentEnergy, currentFrame) {
    if (!aegisSheetDb || !aegisSheetDb.categories || !categoryTab) {
        return { byEnergy: null, byFrame: null, byBoth: null };
    }
    const list = aegisSheetDb.categories[categoryTab] || [];
    const normEnergy = currentEnergy.toLowerCase().trim();
    const normFrame = currentFrame.toLowerCase().replace(/ frame$/, '').trim();
    const byEnergy = list.find(w => w.energy.toLowerCase().trim() === normEnergy) || null;
    const byFrame = list.find(w => w.frame.toLowerCase().replace(/ frame$/, '').trim() === normFrame) || null;
    const byBoth = list.find(w => w.energy.toLowerCase().trim() === normEnergy &&
        w.frame.toLowerCase().replace(/ frame$/, '').trim() === normFrame) || null;
    return { byEnergy, byFrame, byBoth };
}
function isWordSubsequence(subWords, mainWords) {
    let subIdx = 0;
    for (let mainIdx = 0; mainIdx < mainWords.length && subIdx < subWords.length; mainIdx++) {
        if (mainWords[mainIdx] === subWords[subIdx]) {
            subIdx++;
        }
    }
    return subIdx === subWords.length;
}
function isPerkMatch(perkName, recName) {
    const pNameClean = perkName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const rNameClean = recName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!pNameClean || !rNameClean)
        return false;
    const pWords = pNameClean.split(' ');
    const rWords = rNameClean.split(' ');
    const pStripped = pNameClean.replace(/\s+/g, '');
    const rStripped = rNameClean.replace(/\s+/g, '');
    if (pStripped === rStripped)
        return true;
    if (isWordSubsequence(rWords, pWords))
        return true;
    if (isWordSubsequence(pWords, rWords))
        return true;
    return false;
}
function computeGrade(p1, p2, mag, barrel, origin, treatSelectableAsActive) {
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
function evaluateCategoryPerks(recString, availablePerks, perksMap) {
    if (!recString || recString.trim() === '' || recString.trim() === '-' || recString.toLowerCase() === 'none') {
        return [];
    }
    // Split by slashes or newlines
    const recs = recString
        .split(/[\/\n]+/)
        .map(s => s.trim())
        .filter(Boolean);
    const results = [];
    for (const rawRec of recs) {
        const rec = cleanPerkName(rawRec);
        if (!rec)
            continue;
        let foundPerk = null;
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
        }
        else {
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
function getSlotStatusFromEvaluations(evals) {
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
function scoreSheetWeapon(sheetWeapon, perksMap, activeHashes) {
    const availablePerks = [];
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
        if (s === 'active')
            pct += 25;
        else if (s === 'selectable')
            pct += 15;
    }
    const matchedList = [];
    const missingList = [];
    const categories = [
        { type: 'barrel', evals: barrelEvals },
        { type: 'mag', evals: magEvals },
        { type: 'perk1', evals: p1Evals },
        { type: 'perk2', evals: p2Evals },
        { type: 'origin', evals: originEvals },
    ];
    const selectablePerkNames = [];
    for (const cat of categories) {
        for (const perk of cat.evals) {
            const tooltipPerk = {
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
            }
            else {
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
    const upgradeAvailable = potIdx > curIdx;
    return {
        result: {
            grade: finalGrade,
            matchPercentage: pct,
            matchedPerks: [],
            missingPerks: [],
            notes: sheetWeapon.notes || '',
            wishlistPerks: [],
            upgradeAvailable,
        },
        potentialGrade,
        upgradeAdvice,
        sheetPerks: { matched: matchedList, missing: missingList }
    };
}
/* ==========================================================================
   Aegis Database Explorer Slide-out Panel Injection & Controller Logic
   ========================================================================== */
function populateFramesFilter(selectedCat) {
    if (!aegisSheetDb)
        return;
    const frameSelect = document.querySelector('.aegis-explorer-frame-select');
    if (!frameSelect)
        return;
    const prevValue = frameSelect.value;
    // Clear existing options except the first one ("All Frames")
    while (frameSelect.children.length > 1) {
        frameSelect.removeChild(frameSelect.lastChild);
    }
    const frames = new Set();
    if (selectedCat) {
        const list = aegisSheetDb.categories[selectedCat] || [];
        for (const w of list) {
            if (w.frame) {
                frames.add(w.frame.trim());
            }
        }
    }
    else {
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
    }
    else {
        frameSelect.value = '';
    }
}
function populateFilters() {
    if (!aegisSheetDb || !aegisSheetDb.categories)
        return;
    const catSelect = document.querySelector('.aegis-explorer-category-select');
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
    const resultsContainer = document.querySelector('.aegis-explorer-results');
    if (!resultsContainer)
        return;
    if (!aegisSheetDb || !aegisSheetDb.weapons) {
        resultsContainer.innerHTML = '<div class="aegis-explorer-empty">Loading database...</div>';
        return;
    }
    const searchInput = document.querySelector('.aegis-explorer-search-input');
    const catSelect = document.querySelector('.aegis-explorer-category-select');
    const frameSelect = document.querySelector('.aegis-explorer-frame-select');
    const elementSelect = document.querySelector('.aegis-explorer-element-select');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedCat = catSelect ? catSelect.value : '';
    const selectedFrame = frameSelect ? frameSelect.value : '';
    const selectedElement = elementSelect ? elementSelect.value : '';
    const matches = [];
    for (const [cat, list] of Object.entries(aegisSheetDb.categories)) {
        if (selectedCat && cat !== selectedCat)
            continue;
        for (const w of list) {
            if (selectedFrame && w.frame !== selectedFrame)
                continue;
            if (selectedElement && w.energy.toLowerCase().trim() !== selectedElement.toLowerCase().trim())
                continue;
            if (query) {
                const nameMatch = w.name.toLowerCase().includes(query);
                const notesMatch = w.notes.toLowerCase().includes(query);
                const frameMatch = w.frame.toLowerCase().includes(query);
                const perksMatch = (w.perk1 + ' ' + w.perk2).toLowerCase().includes(query);
                if (!nameMatch && !notesMatch && !frameMatch && !perksMatch)
                    continue;
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
        }
        else {
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
            const target = e.target;
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
function triggerDimSearch(weaponName) {
    const searchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]');
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
    if (!document.body || document.querySelector('.aegis-fab'))
        return;
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
        populateFramesFilter(catSelect.value);
        onUpdate();
    });
    frameSelect?.addEventListener('change', onUpdate);
    elementSelect?.addEventListener('change', onUpdate);
}
// Load wishlist & config on startup
chrome.storage.local.get(['wishlistData', 'enhancedToNormal', 'scoringSource', 'lightggData', 'aegisSheetDb', 'perkRegistry', 'aegisLayoutSide', 'aegisDbMode', 'aegisTwoTier'], (res) => {
    wishlistDb = res.wishlistData || {};
    enhancedToNormalMap = res.enhancedToNormal || {};
    scoringSource = res.scoringSource || 'aegis';
    aegisLayoutSide = res.aegisLayoutSide || 'side';
    aegisDbMode = res.aegisDbMode || 'both';
    aegisTwoTier = res.aegisTwoTier || false;
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
        if (changes.aegisTwoTier) {
            aegisTwoTier = changes.aegisTwoTier.newValue || false;
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
function handleMouseEnter(e) {
    const el = e.currentTarget;
    hoveredElement = el;
    setupRegistryObserver();
    const result = el._aegisResult;
    const name = el._aegisName;
    const perksMap = el._aegisPerksMap;
    const activeHashes = el._aegisActiveHashes;
    if (result && result.grade) {
        const sheetWeapon = el._aegisSheetWeapon;
        const bestAlternative = el._aegisBestAlternative;
        const isBestInClass = el._aegisIsBestInClass;
        const sheetPerks = el._aegisSheetPerks;
        const sheetArmor = el._aegisSheetArmor;
        showTooltip(el, result, name, perksMap, activeHashes, scoringSource === 'lightgg', sheetWeapon, bestAlternative, isBestInClass, sheetPerks, perkNameToIcon, sheetArmor);
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
function injectPopupSummary(popupContainer, result, scoringSource, sheetWeapon, sheetPerks, sheetArmor) {
    const titleEl = popupContainer.querySelector('h1, [class*="title"]');
    if (!titleEl)
        return;
    const header = titleEl.parentElement;
    if (!header)
        return;
    // Clean up any previously injected details card
    popupContainer.querySelectorAll('[data-aegis-details="true"]').forEach((el) => el.remove());
    let summaryEl = popupContainer.querySelector('.aegis-popup-summary');
    if (!result.grade) {
        if (summaryEl)
            summaryEl.remove();
        return;
    }
    if (!summaryEl) {
        summaryEl = document.createElement('div');
        summaryEl.className = 'aegis-popup-summary';
        titleEl.insertAdjacentElement('afterend', summaryEl);
    }
    if (sheetArmor) {
        const val2 = getGradeValue(sheetArmor.piece2Rating);
        const val4 = getGradeValue(sheetArmor.piece4Rating);
        const betterRating = val2 >= val4 ? sheetArmor.piece2Rating : sheetArmor.piece4Rating;
        let baseGradeLetter = betterRating.toLowerCase().trim();
        if (baseGradeLetter.endsWith('+') || baseGradeLetter.endsWith('-')) {
            baseGradeLetter = baseGradeLetter.slice(0, -1);
        }
        const gradeClass = `aegis-badge-${baseGradeLetter}`;
        const wideClass = 'aegis-popup-grade-badge-wide';
        safeSetInnerHTML(summaryEl, `
      <div class="aegis-popup-summary-content">
        <div class="aegis-popup-row">
          <span class="aegis-popup-grade-badge ${gradeClass} ${wideClass}">${result.grade}</span>
          <span class="aegis-popup-label">Armor Set Bonus Ratings</span>
        </div>
      </div>
    `);
        // Inject armor detail card below sockets
        const sockets = popupContainer.querySelector('[class*="sockets" i], [class*="Sockets" i]');
        if (sockets) {
            const detailsCard = document.createElement('div');
            detailsCard.className = 'aegis-popup-details-card';
            detailsCard.setAttribute('data-aegis-details', 'true');
            safeSetInnerHTML(detailsCard, `
        <div class="aegis-popup-details-title">Armor Set Bonuses</div>
        
        <div class="aegis-armor-bonus-section">
          <div class="aegis-armor-bonus-header">
            <span class="aegis-armor-bonus-title">2-Piece Bonus: <strong>${sheetArmor.piece2Name}</strong></span>
            <span class="aegis-popup-grade-badge aegis-badge-${sheetArmor.piece2Rating.toLowerCase().replace(/[^a-z0-9]/g, '')}">${sheetArmor.piece2Rating}</span>
          </div>
          <div class="aegis-armor-bonus-desc">${sheetArmor.piece2Desc}</div>
          ${sheetArmor.piece2Numbers ? `<div class="aegis-armor-bonus-numbers"><strong>In-Depth:</strong> ${sheetArmor.piece2Numbers}</div>` : ''}
        </div>

        <div class="aegis-popup-meta-divider"></div>

        <div class="aegis-armor-bonus-section">
          <div class="aegis-armor-bonus-header">
            <span class="aegis-armor-bonus-title">4-Piece Bonus: <strong>${sheetArmor.piece4Name}</strong></span>
            <span class="aegis-popup-grade-badge aegis-badge-${sheetArmor.piece4Rating.toLowerCase().replace(/[^a-z0-9]/g, '')}">${sheetArmor.piece4Rating}</span>
          </div>
          <div class="aegis-armor-bonus-desc">${sheetArmor.piece4Desc}</div>
          ${sheetArmor.piece4Numbers ? `<div class="aegis-armor-bonus-numbers"><strong>In-Depth:</strong> ${sheetArmor.piece4Numbers}</div>` : ''}
        </div>

        <div class="aegis-popup-meta-divider"></div>

        <div class="aegis-popup-meta-content">
          <div class="aegis-popup-row" style="gap: 8px;">
            <span class="aegis-popup-meta-badge aegis-tier-source" style="background: linear-gradient(135deg, #1abc9c, #16a085) !important;">${sheetArmor.sourceType}</span>
            <span class="aegis-popup-meta-rank" style="color: #ccc;">Source: ${sheetArmor.source}</span>
          </div>
        </div>
      `);
            sockets.insertAdjacentElement('afterend', detailsCard);
        }
        return;
    }
    const baseGradeLetter = result.grade.charAt(0).toLowerCase();
    const gradeClass = `aegis-grade-${baseGradeLetter}`;
    const isLightGG = scoringSource === 'lightgg';
    let notesHtml = '';
    let showNotes = result.notes;
    if (sheetWeapon && showNotes === sheetWeapon.notes) {
        showNotes = '';
    }
    if (result.wishlistNotes) {
        showNotes = result.wishlistNotes;
    }
    if (showNotes) {
        const titleLabel = isLightGG && !result.wishlistNotes ? 'Information' : 'Wishlist Notes';
        notesHtml = `<div class="aegis-popup-notes-text"><strong>${titleLabel}:</strong> ${showNotes}</div>`;
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
    const gradeStr = result.grade || '';
    const isTwoTier = gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-'));
    const popupBaseGradeLetter = isTwoTier
        ? gradeStr.substring(1).charAt(0).toLowerCase()
        : baseGradeLetter;
    const wideClass = isTwoTier ? 'aegis-popup-grade-badge-wide' : '';
    safeSetInnerHTML(summaryEl, `
    <div class="aegis-popup-summary-content">
      <div class="aegis-popup-row">
        <span class="aegis-popup-grade-badge aegis-badge-${popupBaseGradeLetter} ${wideClass}">${result.grade}</span>
        <span class="aegis-popup-label">${matchLabel}</span>
      </div>
      ${upgradeAdviceHtml}
      ${notesHtml}
    </div>
    ${sheetMetaHtml}
  `);
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
                if (!item.rawVal)
                    continue;
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
                    if (!cleanVal)
                        continue;
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
                const uniqueSups = new Map();
                const addUniqueSup = (label, supW) => {
                    if (!supW)
                        return;
                    const key = supW.name.toLowerCase();
                    if (uniqueSups.has(key)) {
                        uniqueSups.get(key).labels.push(label);
                    }
                    else {
                        uniqueSups.set(key, { weapon: supW, labels: [label] });
                    }
                };
                if (sheetWeapon.energy)
                    addUniqueSup(sheetWeapon.energy, superiors.byEnergy);
                if (sheetWeapon.frame)
                    addUniqueSup(sheetWeapon.frame, superiors.byFrame);
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
                safeSetInnerHTML(detailsCard, `
          <div class="aegis-details-header">Aegis Recommended Perks</div>
          <div class="aegis-details-body aegis-perks-body" style="margin-bottom: ${superiorsHtml ? '10px' : '0'};">
            ${perksRowsHtml}
          </div>
          ${superiorsHtml}
        `);
                setTimeout(() => {
                    const isSheet = popupContainer.matches('[class*="Sheet"], [class*="sheet"]');
                    const rect = popupContainer.getBoundingClientRect();
                    const spaceLeft = rect.left;
                    const spaceRight = window.innerWidth - rect.right;
                    if (aegisLayoutSide === 'side' && window.innerWidth >= 1000 && (isSheet || spaceLeft >= 330 || spaceRight >= 330)) {
                        detailsCard.classList.add('aegis-side-panel');
                        popupContainer.appendChild(detailsCard);
                        detailsCard.style.setProperty('position', 'absolute', 'important');
                        detailsCard.style.setProperty('top', '55px', 'important');
                        if (isSheet || (spaceLeft >= spaceRight && spaceLeft >= 330)) {
                            detailsCard.style.setProperty('left', '-320px', 'important');
                            detailsCard.style.setProperty('right', 'auto', 'important');
                        }
                        else if (spaceRight >= 330) {
                            detailsCard.style.setProperty('left', 'auto', 'important');
                            detailsCard.style.setProperty('right', '-320px', 'important');
                        }
                        else {
                            // Fallback to inline if neither side has enough space
                            detailsCard.classList.remove('aegis-side-panel');
                            detailsCard.style.removeProperty('position');
                            detailsCard.style.removeProperty('top');
                            detailsCard.style.removeProperty('left');
                            detailsCard.style.removeProperty('right');
                            insertTarget.after(detailsCard);
                        }
                    }
                    else {
                        detailsCard.classList.remove('aegis-side-panel');
                        detailsCard.style.removeProperty('position');
                        detailsCard.style.removeProperty('top');
                        detailsCard.style.removeProperty('left');
                        detailsCard.style.removeProperty('right');
                        insertTarget.after(detailsCard);
                    }
                }, 50);
            }
        }
    }
}
/**
 * Injects or updates the Aegis rank badge overlay inside a weapon tile.
 */
function injectBadge(el, result) {
    let badgeTarget = el.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"]');
    if (!badgeTarget) {
        badgeTarget = el;
    }
    // Ensure the badge target is relatively positioned so the absolute badge is anchored to it
    badgeTarget.style.setProperty('position', 'relative', 'important');
    // Handle S-tier gold glow class on the badge target
    if (badgeTarget) {
        badgeTarget.classList.remove('aegis-gold-glow');
        if (result.grade && result.grade.startsWith('S')) {
            badgeTarget.classList.add('aegis-gold-glow');
        }
    }
    let badge = badgeTarget.querySelector('.aegis-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'aegis-badge';
        badgeTarget.appendChild(badge);
    }
    // Remove existing grade classes
    badge.className = 'aegis-badge';
    // Set grade class and text (normalizing S+ / A- etc. to the first letter class)
    const gradeStr = result.grade || '';
    const isTwoTier = gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-'));
    const isArmor = gradeStr.includes('/');
    let baseLetter = '';
    if (isArmor) {
        const parts = gradeStr.split('/');
        const val2 = getGradeValue(parts[0]);
        const val4 = getGradeValue(parts[1]);
        const betterRating = val2 >= val4 ? parts[0] : parts[1];
        baseLetter = betterRating.toLowerCase().trim();
        if (baseLetter.endsWith('+') || baseLetter.endsWith('-')) {
            baseLetter = baseLetter.slice(0, -1);
        }
    }
    else {
        // If it's a 2-tier grade (e.g. BS+ or SF), base color class on the actual roll matching grade (the last letter/symbol part)
        baseLetter = isTwoTier
            ? gradeStr.substring(1).charAt(0).toLowerCase()
            : (gradeStr ? gradeStr.charAt(0).toLowerCase() : '');
    }
    badge.classList.add(`aegis-badge-${baseLetter}`);
    if (isTwoTier || isArmor) {
        badge.classList.add('aegis-badge-wide');
    }
    badge.textContent = gradeStr;
    if (result.upgradeAvailable) {
        const upgradeArrow = document.createElement('span');
        upgradeArrow.className = 'aegis-badge-upgrade-arrow';
        upgradeArrow.textContent = '▲';
        badge.appendChild(upgradeArrow);
    }
}
/**
 * Removes the Aegis badge overlay from a weapon tile if it exists.
 */
function removeBadge(el) {
    let badgeTarget = el.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"]');
    if (badgeTarget) {
        badgeTarget.classList.remove('aegis-gold-glow');
    }
    else {
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
function processElement(el) {
    // If an ancestor is also annotated, this is a nested child element.
    // Skip it — the parent element handles badge injection for this item.
    // Do NOT call removeBadge here: the badge was injected INTO this element
    // by the parent's injectBadge() call, and removing it would destroy it.
    const parentWrapper = el.parentElement?.closest('[data-aegis-item-hash]');
    if (parentWrapper) {
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
    const itemType = el.getAttribute('data-aegis-item-type') || 'weapon';
    if (itemType === 'armor') {
        if (!itemHashStr)
            return;
        try {
            const sheetArmor = findAegisArmorSet(weaponName);
            let result;
            if (sheetArmor) {
                result = {
                    grade: `${sheetArmor.piece2Rating}/${sheetArmor.piece4Rating}`,
                    matchPercentage: 100,
                    matchedPerks: [],
                    missingPerks: [],
                    notes: `2-Piece: ${sheetArmor.piece2Name} - ${sheetArmor.piece2Desc}\n4-Piece: ${sheetArmor.piece4Name} - ${sheetArmor.piece4Desc}`,
                    wishlistPerks: [],
                    wishlistNotes: `Source: ${sheetArmor.source} (${sheetArmor.sourceType})`,
                };
            }
            else {
                result = {
                    grade: null,
                    matchPercentage: 0,
                    matchedPerks: [],
                    missingPerks: [],
                    notes: '',
                    wishlistPerks: [],
                };
            }
            el._aegisResult = result;
            el._aegisName = weaponName;
            el._aegisSheetArmor = sheetArmor;
            if (result.grade) {
                const isPopup = el.matches('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
                if (!isPopup) {
                    injectBadge(el, result);
                }
                const popupContainer = isPopup ? el : el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
                if (popupContainer) {
                    injectPopupSummary(popupContainer, result, scoringSource, undefined, undefined, sheetArmor);
                }
                if (!isPopup && !el.hasAttribute('data-aegis-listeners')) {
                    el.addEventListener('mouseenter', handleMouseEnter);
                    el.addEventListener('mouseleave', handleMouseLeave);
                    el.setAttribute('data-aegis-listeners', 'true');
                }
            }
            else {
                removeBadge(el);
                const popupContainer = el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
                if (popupContainer) {
                    const summary = popupContainer.querySelector('.aegis-popup-summary');
                    if (summary)
                        summary.remove();
                }
                if (el.hasAttribute('data-aegis-listeners')) {
                    el.removeEventListener('mouseenter', handleMouseEnter);
                    el.removeEventListener('mouseleave', handleMouseLeave);
                    el.removeAttribute('data-aegis-listeners');
                }
            }
        }
        catch (err) {
            console.error('Error processing armor element in content script:', err);
        }
        return;
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
        let perksMap = {};
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
        let activeHashes = [];
        if (activePerksDataStr) {
            activeHashes = activePerksDataStr.split(',').map(Number).filter(h => !isNaN(h) && h > 0);
        }
        let result;
        let sheetPerks = undefined;
        const sheetWeapon = findAegisWeapon(weaponName);
        let bestAlternative = undefined;
        let isBestInClass = false;
        if (scoringSource === 'lightgg') {
            const rawInstanceId = el.getAttribute('data-aegis-instance-id') || el.id.replace('item-', '');
            const instanceId = rawInstanceId.replace(/^[^0-9]+/, '');
            const grade = lightggDb[instanceId];
            if (grade) {
                let aegisResult;
                const useSheet = sheetWeapon && aegisDbMode !== 'wishlist';
                const useWishlist = aegisDbMode !== 'spreadsheet';
                let wishlistResult = null;
                if (useWishlist && wishlistDb && wishlistDb[itemHash]) {
                    wishlistResult = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
                }
                if (useSheet) {
                    const sheetScore = scoreSheetWeapon(sheetWeapon, perksMap, activeHashes);
                    aegisResult = sheetScore.result;
                    sheetPerks = sheetScore.sheetPerks;
                    aegisResult.upgradeAdvice = sheetScore.upgradeAdvice;
                    aegisResult.potentialGrade = sheetScore.potentialGrade;
                    if (wishlistResult && wishlistResult.grade) {
                        aegisResult.wishlistNotes = wishlistResult.notes;
                    }
                }
                else if (useWishlist && wishlistResult) {
                    aegisResult = wishlistResult;
                }
                else {
                    aegisResult = {
                        grade: null,
                        matchPercentage: 0,
                        matchedPerks: [],
                        missingPerks: [],
                        notes: '',
                        wishlistPerks: [],
                    };
                }
                result = {
                    grade: grade,
                    matchPercentage: aegisResult.grade ? aegisResult.matchPercentage : 100,
                    matchedPerks: aegisResult.matchedPerks,
                    missingPerks: aegisResult.missingPerks,
                    notes: aegisResult.notes || 'Community popularity rating from Light.gg Roll Appraiser.',
                    wishlistPerks: aegisResult.wishlistPerks,
                    upgradeAdvice: aegisResult.upgradeAdvice,
                    potentialGrade: aegisResult.potentialGrade,
                    wishlistNotes: aegisResult.wishlistNotes,
                };
            }
            else {
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
        else {
            const useSheet = sheetWeapon && aegisDbMode !== 'wishlist';
            const useWishlist = aegisDbMode !== 'spreadsheet';
            let wishlistResult = null;
            if (useWishlist && wishlistDb && wishlistDb[itemHash]) {
                wishlistResult = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
            }
            if (useSheet) {
                const sheetScore = scoreSheetWeapon(sheetWeapon, perksMap, activeHashes);
                result = sheetScore.result;
                sheetPerks = sheetScore.sheetPerks;
                result.upgradeAdvice = sheetScore.upgradeAdvice;
                result.potentialGrade = sheetScore.potentialGrade;
                if (wishlistResult && wishlistResult.grade) {
                    result.wishlistNotes = wishlistResult.notes;
                }
            }
            else if (useWishlist && wishlistResult) {
                result = wishlistResult;
            }
            else {
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
            const superiors = findSuperiors(categoryTab, sheetWeapon.energy, sheetWeapon.frame);
            const bestW = superiors.byBoth || superiors.byFrame || superiors.byEnergy;
            if (bestW) {
                if (bestW.name.toLowerCase() === sheetWeapon.name.toLowerCase()) {
                    isBestInClass = true;
                }
                else {
                    bestAlternative = `${bestW.name} (${bestW.tier} #${bestW.rank})`;
                }
            }
        }
        // Attach data on the element object for hover events to retrieve
        el._aegisResult = result;
        el._aegisName = weaponName;
        el._aegisPerksMap = perksMap;
        el._aegisActiveHashes = activeHashes;
        el._aegisSheetWeapon = hasSheetData ? sheetWeapon : null;
        el._aegisBestAlternative = bestAlternative;
        el._aegisIsBestInClass = isBestInClass;
        el._aegisSheetPerks = hasSheetData ? sheetPerks : null;
        if (result.grade) {
            // Modify grade string to be 2-tier if configured and sheet data is present
            if (aegisTwoTier && hasSheetData && sheetWeapon && sheetWeapon.tier) {
                const archetypeTier = sheetWeapon.tier.trim();
                result.grade = `${archetypeTier}${result.grade}`;
            }
            const isPopup = el.matches('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
            // Inject rank badge (only if not the popup container itself)
            if (!isPopup) {
                injectBadge(el, result);
            }
            // Inject popup summary card if inside a details popup (or if we are the popup container)
            const popupContainer = isPopup ? el : el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
            if (popupContainer) {
                injectPopupSummary(popupContainer, result, scoringSource, sheetWeapon || undefined, sheetPerks);
            }
            // Attach event listeners for the tooltip if not already done (only if not the popup container itself)
            if (!isPopup && !el.hasAttribute('data-aegis-listeners')) {
                el.addEventListener('mouseenter', handleMouseEnter);
                el.addEventListener('mouseleave', handleMouseLeave);
                el.setAttribute('data-aegis-listeners', 'true');
            }
        }
        else {
            // If graded previously but now has no grade, remove UI
            removeBadge(el);
            const popupContainer = el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
            if (popupContainer) {
                const summary = popupContainer.querySelector('.aegis-popup-summary');
                if (summary)
                    summary.remove();
            }
            if (el.hasAttribute('data-aegis-listeners')) {
                el.removeEventListener('mouseenter', handleMouseEnter);
                el.removeEventListener('mouseleave', handleMouseLeave);
                el.removeAttribute('data-aegis-listeners');
            }
        }
    }
    catch (err) {
        console.error('Error processing element in content script:', err);
    }
}
function setupSearchFilterObserver() {
    const searchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]');
    if (!searchInput)
        return;
    if (searchInput.hasAttribute('data-aegis-search-observer'))
        return;
    searchInput.setAttribute('data-aegis-search-observer', 'true');
    searchInput.addEventListener('input', () => {
        const val = searchInput.value.trim().toLowerCase();
        // Check if search query has "aegis:grade"
        const aegisMatch = val.match(/\baegis:([a-z0-9+:-]+)/);
        if (aegisMatch) {
            const targetQuery = aegisMatch[1].toLowerCase();
            const items = document.querySelectorAll('[data-aegis-item-hash]');
            items.forEach(item => {
                const result = item._aegisResult;
                const grade = result?.grade?.toLowerCase() || '';
                // Extract weapon rank and perk rank if it's a 2-tier grade (e.g. "bs+")
                let isMatch = false;
                const isArmor = grade.includes('/');
                if (isArmor) {
                    const parts = grade.split('/');
                    const rating2 = parts[0];
                    const rating4 = parts[1];
                    if (targetQuery.startsWith('2p:') || targetQuery.startsWith('2piece:')) {
                        const targetRank = targetQuery.startsWith('2p:') ? targetQuery.substring(3) : targetQuery.substring(7);
                        isMatch = (rating2 === targetRank || rating2.startsWith(targetRank));
                    }
                    else if (targetQuery.startsWith('4p:') || targetQuery.startsWith('4piece:')) {
                        const targetRank = targetQuery.startsWith('4p:') ? targetQuery.substring(3) : targetQuery.substring(7);
                        isMatch = (rating4 === targetRank || rating4.startsWith(targetRank));
                    }
                    else if (targetQuery.includes('/')) {
                        isMatch = (grade === targetQuery);
                    }
                    else {
                        // General query matching either 2p or 4p rating
                        isMatch = (rating2 === targetQuery || rating2.startsWith(targetQuery) || rating4 === targetQuery || rating4.startsWith(targetQuery));
                    }
                }
                else {
                    let weaponRank = '';
                    let perkRank = '';
                    const isTwoTier = grade.length > 2 || (grade.length === 2 && !grade.endsWith('+') && !grade.endsWith('-'));
                    if (isTwoTier) {
                        weaponRank = grade.charAt(0);
                        perkRank = grade.substring(1);
                    }
                    else {
                        perkRank = grade;
                    }
                    if (targetQuery === 'god') {
                        isMatch = perkRank.includes('s') || perkRank.includes('s+');
                    }
                    else if (targetQuery.startsWith('w:') || targetQuery.startsWith('weapon:')) {
                        const targetRank = targetQuery.startsWith('w:') ? targetQuery.substring(2) : targetQuery.substring(7);
                        isMatch = (weaponRank === targetRank);
                    }
                    else if (targetQuery.startsWith('p:') || targetQuery.startsWith('perk:')) {
                        const targetRank = targetQuery.startsWith('p:') ? targetQuery.substring(2) : targetQuery.substring(5);
                        isMatch = (perkRank === targetRank || perkRank.startsWith(targetRank));
                    }
                    else {
                        // General match: combined grade, or weapon rank, or perk rank
                        isMatch = (grade === targetQuery || weaponRank === targetQuery || perkRank === targetQuery || perkRank.startsWith(targetQuery));
                    }
                }
                if (isMatch) {
                    item.style.setProperty('opacity', '1', 'important');
                    item.style.setProperty('filter', 'none', 'important');
                }
                else {
                    item.style.setProperty('opacity', '0.15', 'important');
                    item.style.setProperty('filter', 'grayscale(80%)', 'important');
                }
            });
        }
        else {
            // Restore all items
            const items = document.querySelectorAll('[data-aegis-item-hash]');
            items.forEach(item => {
                item.style.removeProperty('opacity');
                item.style.removeProperty('filter');
            });
        }
    });
}
/**
 * Scans the page DOM for annotated item elements and processes them.
 */
function reprocessAllElements() {
    setupRegistryObserver();
    setupSearchFilterObserver();
    const elements = document.querySelectorAll('[data-aegis-item-hash]');
    for (let i = 0; i < elements.length; i++) {
        processElement(elements[i]);
    }
}
// 1. Observe the DOM for additions or changes to 'data-aegis-item-hash' or 'data-aegis-perk-hashes'
const observer = new MutationObserver((mutations) => {
    setupSearchFilterObserver();
    for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        // Check if the custom data attributes were modified
        if (mutation.type === 'attributes' &&
            (mutation.attributeName === 'data-aegis-item-hash' || mutation.attributeName === 'data-aegis-perk-hashes')) {
            processElement(mutation.target);
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
                    const children = node.querySelectorAll('[data-aegis-item-hash]');
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
