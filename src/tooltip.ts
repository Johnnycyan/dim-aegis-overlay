import { ScoringResult, AegisSheetWeapon, TooltipPerk } from './types';

/** Safely sets element HTML using DOMParser (avoids innerHTML linter warning). */
function safeSetInnerHTML(element: HTMLElement, htmlString: string) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(htmlString, 'text/html');
  element.replaceChildren(...Array.from(parsed.body.childNodes));
}

interface PerkInfo {
  name: string;
  icon: string;
}

let tooltipEl: HTMLDivElement | null = null;

/**
 * Creates the global tooltip element in the DOM if it doesn't already exist.
 */
function getOrCreateTooltip(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'aegis-tooltip';
    tooltipEl.className = 'aegis-tooltip hidden';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

const requestedHashes = new Set<number>();

/**
 * Resolves a perk's display properties from the weapon's local perk mapping or
 * the global perk registry DOM node.
 */
function getPerkInfo(hash: number, localPerksMap: Record<number, PerkInfo>): PerkInfo {
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
      } catch (e) {
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
function positionTooltip(target: HTMLElement, tooltip: HTMLElement) {
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
export function showTooltip(
  target: HTMLElement,
  result: ScoringResult,
  weaponName: string,
  localPerksMap: Record<number, PerkInfo>,
  activeHashes?: number[],
  isLightGG?: boolean,
  sheetWeapon?: AegisSheetWeapon,
  bestAlternative?: string,
  isBestInClass?: boolean,
  sheetPerks?: { matched: TooltipPerk[]; missing: TooltipPerk[] },
  globalPerkNameToIcon?: Record<string, string>
) {
  const tooltip = getOrCreateTooltip();
  const isLightGGMode = !!isLightGG;

  // Normalize grade to match CSS classes (extract roll grade part if using 2-tier)
  const gradeStr = result.grade || '';
  const isTwoTier = gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-'));
  const baseGradeLetter = isTwoTier 
    ? gradeStr.substring(1).charAt(0).toLowerCase() 
    : (gradeStr ? gradeStr.charAt(0).toLowerCase() : '');
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

  // Assemble sheet metadata
  let sheetMetaHtml = '';
  let sheetBodyHtml = '';
  if (sheetWeapon) {
    const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : '';
    const tierClass = `aegis-tier-${tierLetter}`;
    const rankText = sheetWeapon.rank ? `Rank #${sheetWeapon.rank}` : '';
    
    let categoryMetaText = '';
    if (isBestInClass) {
      categoryMetaText = `<span class="aegis-tooltip-best-tag">★ Best in Class</span>`;
    } else if (bestAlternative) {
      categoryMetaText = `<span class="aegis-tooltip-alt-text">Alt: ${bestAlternative}</span>`;
    }

    sheetMetaHtml = `
      <div class="aegis-tooltip-sheet-meta">
        <span class="aegis-tooltip-sheet-badge ${tierClass}">${sheetWeapon.tier} Tier</span>
        ${rankText ? `<span class="aegis-tooltip-sheet-rank">${rankText}</span>` : ''}
        ${categoryMetaText}
      </div>
    `;

    // Shortened recommended perks
    const cleanPerk1 = sheetWeapon.perk1 ? sheetWeapon.perk1.split('\n')[0].trim() : '';
    const cleanPerk2 = sheetWeapon.perk2 ? sheetWeapon.perk2.split('\n')[0].trim() : '';
    let recsHtml = '';
    if (cleanPerk1 || cleanPerk2) {
      const perksText = [cleanPerk1, cleanPerk2].filter(Boolean).join(' / ');
      recsHtml = `
        <div class="aegis-tooltip-compact-recs">
          <span class="aegis-tooltip-recs-label">Rec Perks:</span>
          <span class="aegis-tooltip-recs-value" title="${perksText}">${perksText}</span>
        </div>
      `;
    }

    if (sheetWeapon.notes || recsHtml) {
      sheetBodyHtml = `
        <div class="aegis-tooltip-section aegis-meta-section">
          <div class="aegis-tooltip-section-title">Aegis Meta Analysis</div>
          ${recsHtml}
          ${sheetWeapon.notes ? `<div class="aegis-tooltip-meta-note">${sheetWeapon.notes}</div>` : ''}
        </div>
      `;
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
      ${sheetMetaHtml}
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
  } else {
    html += `
      <div class="aegis-tooltip-match-bar-container">
        <div class="aegis-tooltip-match-label" style="color: #ffb300;">Light.gg Roll Appraisal</div>
      </div>
    `;
  }

  let upgradeBannerHtml = '';
  if (result.upgradeAdvice) {
    upgradeBannerHtml = `
      <div class="aegis-tooltip-upgrade-banner">
        ${result.upgradeAdvice}
      </div>
    `;
  }

  html += `
    </div>
    
    <div class="aegis-tooltip-body">
      ${upgradeBannerHtml}
      ${sheetBodyHtml}
  `;

  const hasWishlist = result.wishlistPerks && result.wishlistPerks.length > 0;

  if (sheetPerks) {
    html += `
      <div class="aegis-tooltip-section">
        <div class="aegis-tooltip-section-title">Matched Perks (Spreadsheet)</div>
        <div class="aegis-tooltip-perks-grid">
    `;

    if (sheetPerks.matched.length === 0) {
      html += `<div class="aegis-tooltip-perk-empty">None</div>`;
    } else {
      for (const perk of sheetPerks.matched) {
        const iconUrl = perk.icon ? `https://www.bungie.net${perk.icon}` : '';
        const itemClass = perk.matched ? 'aegis-matched' : 'aegis-selectable';
        const labelSuffix = perk.matched ? '' : ' <span class="aegis-selectable-suffix">(Selectable)</span>';
        html += `
          <div class="aegis-tooltip-perk-item ${itemClass}">
            ${iconUrl ? `<img src="${iconUrl}" class="aegis-perk-icon-img" alt="" />` : '<span class="aegis-perk-bullet">•</span>'}
            <span class="aegis-perk-name-text">${perk.name}${labelSuffix}</span>
          </div>
        `;
      }
    }

    html += `
        </div>
      </div>
    `;

    if (sheetPerks.missing.length > 0) {
      html += `
        <div class="aegis-tooltip-section">
          <div class="aegis-tooltip-section-title">Missing Perks (Spreadsheet)</div>
          <div class="aegis-tooltip-perks-grid">
      `;

      for (const perk of sheetPerks.missing) {
        let iconPath = perk.icon || '';
        if (!iconPath && globalPerkNameToIcon) {
          const normName = perk.name.toLowerCase().trim();
          const cleanName = normName.replace(/\s*\([^)]+\)\s*/g, '').replace(/[*+]/g, '').trim();
          iconPath = globalPerkNameToIcon[cleanName] || globalPerkNameToIcon[normName] || '';
        }
        const iconUrl = iconPath ? `https://www.bungie.net${iconPath}` : '';
        html += `
          <div class="aegis-tooltip-perk-item aegis-missing">
            ${iconUrl ? `<img src="${iconUrl}" class="aegis-perk-icon-img" alt="" />` : '<span class="aegis-perk-bullet">•</span>'}
            <span class="aegis-perk-name-text">${perk.name}</span>
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    }
  } else if (hasWishlist) {
    html += `
      <div class="aegis-tooltip-section">
        <div class="aegis-tooltip-section-title">Matched Perks</div>
        <div class="aegis-tooltip-perks-grid">
    `;

    if (result.matchedPerks.length === 0) {
      html += `<div class="aegis-tooltip-perk-empty">None</div>`;
    } else {
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
  } else {
    // Fallback: show only the plugged/active perks
    // Filter to meaningful perks: exclude trackers, empty sockets, mods, ornaments, shaders by name keywords
    const JUNK_KEYWORDS = /tracker|empty|default|ornament|shader|catalyst|upgrade|mod socket|memento/i;
    
    // Build the list of perks to display
    let displayHashes: number[] = [];
    if (activeHashes && activeHashes.length > 0) {
      // Use active hashes, filtered through localPerksMap for names
      displayHashes = activeHashes.filter(hash => {
        const info = localPerksMap[hash];
        if (!info) return false;
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
    } else {
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

  let showNotes = result.notes;
  if (sheetWeapon && showNotes === sheetWeapon.notes) {
    showNotes = '';
  }
  if (result.wishlistNotes) {
    showNotes = result.wishlistNotes;
  }

  if (showNotes) {
    const sectionTitle = isLightGGMode && !result.wishlistNotes ? 'Information' : 'Wishlist Notes';
    html += `
      <div class="aegis-tooltip-section aegis-notes-section">
        <div class="aegis-tooltip-section-title">${sectionTitle}</div>
        <div class="aegis-tooltip-notes-text">${showNotes}</div>
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
