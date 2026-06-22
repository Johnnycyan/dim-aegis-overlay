import { safeSetInnerHTML } from './dom-utils';
let tooltipEl = null;
/**
 * Creates the global tooltip element in the DOM if it doesn't already exist.
 */
function getOrCreateTooltip() {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'aegis-tooltip';
        tooltipEl.className = 'aegis-tooltip hidden';
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}
const requestedHashes = new Set();
/**
 * Resolves a perk's display properties from the weapon's local perk mapping or
 * the global perk registry DOM node.
 */
function getPerkInfo(hash, localPerksMap) {
    // 1. Try weapon-local socket info first
    if (localPerksMap[hash]) {
        return localPerksMap[hash];
    }
    // 2. Try global page perk registry
    const registryEl = document.getElementById('aegis-global-perk-registry');
    if (registryEl) {
        const registryStr = registryEl.getAttribute('data-registry');
        if (registryStr) {
            try {
                const registry = JSON.parse(registryStr);
                if (registry[hash]) {
                    return registry[hash];
                }
            }
            catch (e) {
                // Silent catch
            }
        }
    }
    // 3. Request the perk name from the main world if registry element exists and we haven't requested it yet
    if (registryEl && !requestedHashes.has(hash)) {
        requestedHashes.add(hash);
        const currentRequests = registryEl.getAttribute('data-request-hashes') || '';
        const requestHashes = currentRequests ? currentRequests.split(',').map((h) => h.trim()).filter(Boolean) : [];
        if (!requestHashes.includes(String(hash))) {
            requestHashes.push(String(hash));
            registryEl.setAttribute('data-request-hashes', requestHashes.join(','));
        }
    }
    // 4. Fallback to hash representation
    return {
        name: `Perk #${hash}`,
        icon: '',
    };
}
/**
 * Positions the tooltip element relative to the target element, keeping it within view.
 */
function positionTooltip(target, tooltip) {
    const targetRect = target.getBoundingClientRect();
    // Temporarily show the tooltip off-screen to measure its size
    tooltip.style.visibility = 'hidden';
    tooltip.classList.remove('hidden');
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.classList.add('hidden');
    tooltip.style.visibility = '';
    const tooltipWidth = tooltipRect.width || 260;
    const tooltipHeight = tooltipRect.height || 180;
    // Default: Position above the weapon tile
    let top = targetRect.top - tooltipHeight - 8;
    let left = targetRect.left + (targetRect.width - tooltipWidth) / 2;
    // Fallback: If it overflows the top of the viewport, display below
    if (top < 8) {
        top = targetRect.bottom + 8;
    }
    // Fit left alignment within viewport
    if (left < 8) {
        left = 8;
    }
    // Fit right alignment within viewport
    const maxLeft = window.innerWidth - tooltipWidth - 8;
    if (left > maxLeft) {
        left = maxLeft;
    }
    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left + window.scrollX}px`;
}
/**
 * Displays the tooltip with weapon ranking and perk matching info.
 *
 * @param target The hovered weapon element.
 * @param result The ScoringResult details.
 * @param weaponName The weapon's display name.
 * @param localPerksMap Dictionary of socketed perk info extracted from this weapon.
 */
export function showTooltip(target, result, weaponName, localPerksMap, activeHashes, isLightGG) {
    const tooltip = getOrCreateTooltip();
    const isLightGGMode = !!isLightGG;
    // Normalize grade to first character (e.g. S+ -> s, A- -> a) to match CSS classes
    const baseGradeLetter = result.grade ? result.grade.charAt(0).toLowerCase() : '';
    const gradeClass = `aegis-grade-${baseGradeLetter}`;
    // Parse PvP/PvE tags
    let tagsHtml = '';
    if (result.notes) {
        const isPvE = /\bpve\b/i.test(result.notes);
        const isPvP = /\bpvp\b/i.test(result.notes);
        if (isPvE || isPvP) {
            tagsHtml = '<div class="aegis-tooltip-tags-row">';
            if (isPvE) {
                tagsHtml += '<span class="aegis-tooltip-tag aegis-tag-pve">PvE</span>';
            }
            if (isPvP) {
                tagsHtml += '<span class="aegis-tooltip-tag aegis-tag-pvp">PvP</span>';
            }
            tagsHtml += '</div>';
        }
    }
    // Assemble premium HTML content
    let html = `
    <div class="aegis-tooltip-header">
      <div class="aegis-tooltip-title-row">
        <span class="aegis-tooltip-weapon-name">${weaponName}</span>
        <span class="aegis-tooltip-grade ${gradeClass}">${result.grade}</span>
      </div>
      ${tagsHtml}
  `;
    if (!isLightGGMode) {
        html += `
      <div class="aegis-tooltip-match-bar-container">
        <div class="aegis-tooltip-match-label">Match Percentage</div>
        <div class="aegis-tooltip-match-value">${result.matchPercentage}%</div>
      </div>
      <div class="aegis-tooltip-progress-bg">
        <div class="aegis-tooltip-progress-fill ${gradeClass}" style="width: ${result.matchPercentage}%"></div>
      </div>
    `;
    }
    else {
        html += `
      <div class="aegis-tooltip-match-bar-container">
        <div class="aegis-tooltip-match-label" style="color: #ffb300;">Light.gg Roll Appraisal</div>
      </div>
    `;
    }
    html += `
    </div>
    
    <div class="aegis-tooltip-body">
  `;
    const hasWishlist = result.wishlistPerks && result.wishlistPerks.length > 0;
    if (hasWishlist) {
        html += `
      <div class="aegis-tooltip-section">
        <div class="aegis-tooltip-section-title">Matched Perks</div>
        <div class="aegis-tooltip-perks-grid">
    `;
        if (result.matchedPerks.length === 0) {
            html += `<div class="aegis-tooltip-perk-empty">None</div>`;
        }
        else {
            for (const hash of result.matchedPerks) {
                const info = getPerkInfo(hash, localPerksMap);
                const iconUrl = info.icon ? `https://www.bungie.net${info.icon}` : '';
                html += `
          <div class="aegis-tooltip-perk-item aegis-matched">
            ${iconUrl ? `<img src="${iconUrl}" class="aegis-perk-icon-img" alt="" />` : '<span class="aegis-perk-bullet">•</span>'}
            <span class="aegis-perk-name-text">${info.name}</span>
          </div>
        `;
            }
        }
        html += `
        </div>
      </div>
    `;
        if (result.missingPerks.length > 0) {
            html += `
        <div class="aegis-tooltip-section">
          <div class="aegis-tooltip-section-title">Missing Perks</div>
          <div class="aegis-tooltip-perks-grid">
      `;
            for (const hash of result.missingPerks) {
                const info = getPerkInfo(hash, localPerksMap);
                const iconUrl = info.icon ? `https://www.bungie.net${info.icon}` : '';
                html += `
          <div class="aegis-tooltip-perk-item aegis-missing">
            ${iconUrl ? `<img src="${iconUrl}" class="aegis-perk-icon-img" alt="" />` : '<span class="aegis-perk-bullet">•</span>'}
            <span class="aegis-perk-name-text">${info.name}</span>
          </div>
        `;
            }
            html += `
          </div>
        </div>
      `;
        }
    }
    else {
        // Fallback: show only the plugged/active perks
        // Filter to meaningful perks: exclude trackers, empty sockets, mods, ornaments, shaders by name keywords
        const JUNK_KEYWORDS = /tracker|empty|default|ornament|shader|catalyst|upgrade|mod socket|memento/i;
        // Build the list of perks to display
        let displayHashes = [];
        if (activeHashes && activeHashes.length > 0) {
            // Use active hashes, filtered through localPerksMap for names
            displayHashes = activeHashes.filter(hash => {
                const info = localPerksMap[hash];
                if (!info)
                    return false;
                return !JUNK_KEYWORDS.test(info.name);
            });
        }
        html += `
      <div class="aegis-tooltip-section">
        <div class="aegis-tooltip-section-title">Active Perks</div>
        <div class="aegis-tooltip-perks-grid">
    `;
        if (displayHashes.length === 0) {
            html += `<div class="aegis-tooltip-perk-empty">No perks detected</div>`;
        }
        else {
            for (const hash of displayHashes) {
                const info = localPerksMap[hash];
                const iconUrl = info.icon ? `https://www.bungie.net${info.icon}` : '';
                html += `
          <div class="aegis-tooltip-perk-item aegis-matched">
            ${iconUrl ? `<img src="${iconUrl}" class="aegis-perk-icon-img" alt="" />` : '<span class="aegis-perk-bullet">•</span>'}
            <span class="aegis-perk-name-text" style="color: #ffffff;">${info.name}</span>
          </div>
        `;
            }
        }
        html += `
        </div>
      </div>
    `;
    }
    if (result.notes) {
        html += `
      <div class="aegis-tooltip-section aegis-notes-section">
        <div class="aegis-tooltip-section-title">${isLightGGMode ? 'Information' : 'Aegis Notes'}</div>
        <div class="aegis-tooltip-notes-text">${result.notes}</div>
      </div>
    `;
    }
    html += `
    </div>
  `;
    safeSetInnerHTML(tooltip, html);
    // Position and display
    positionTooltip(target, tooltip);
    tooltip.classList.remove('hidden');
}
/**
 * Hides the tooltip element.
 */
export function hideTooltip() {
    if (tooltipEl) {
        tooltipEl.classList.add('hidden');
    }
}
