const GRADE_WEIGHTS = {
  S: 4,
  A: 3,
  B: 2,
  C: 1
};
function scoreWeapon(itemHash, rolledPerks, database, enhancedToNormalMap2) {
  const defaultResult = {
    grade: null,
    matchPercentage: 0,
    matchedPerks: [],
    missingPerks: [],
    notes: "",
    wishlistPerks: []
  };
  const recommendations = database[itemHash];
  if (!recommendations || recommendations.length === 0) {
    return defaultResult;
  }
  const rolledSet = /* @__PURE__ */ new Set();
  for (const perk of rolledPerks) {
    rolledSet.add(perk);
    if (enhancedToNormalMap2 && enhancedToNormalMap2[perk]) {
      rolledSet.add(enhancedToNormalMap2[perk]);
    }
  }
  let bestResult = null;
  for (const rec of recommendations) {
    const matched = [];
    const missing = [];
    for (const perk of rec.perks) {
      if (rolledSet.has(perk)) {
        matched.push(perk);
      } else {
        missing.push(perk);
      }
    }
    const missingCount = missing.length;
    let grade = null;
    if (missingCount === 0) {
      grade = "S";
    } else if (missingCount === 1) {
      grade = "A";
    } else if (missingCount === 2) {
      grade = "B";
    } else if (missingCount === 3) {
      grade = "C";
    }
    if (grade === null) {
      continue;
    }
    const matchPercentage = Math.round(matched.length / rec.perks.length * 100);
    const result = {
      grade,
      matchPercentage,
      matchedPerks: matched,
      missingPerks: missing,
      notes: rec.notes,
      wishlistPerks: rec.perks
    };
    if (!bestResult) {
      bestResult = result;
    } else {
      const currentWeight = GRADE_WEIGHTS[result.grade];
      const bestWeight = GRADE_WEIGHTS[bestResult.grade];
      if (currentWeight > bestWeight) {
        bestResult = result;
      } else if (currentWeight === bestWeight && result.matchPercentage > bestResult.matchPercentage) {
        bestResult = result;
      }
    }
  }
  return bestResult || defaultResult;
}
function safeSetInnerHTML$1(element, htmlString) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(htmlString, "text/html");
  element.replaceChildren(...Array.from(parsed.body.childNodes));
}
let tooltipEl = null;
function getOrCreateTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "aegis-tooltip";
    tooltipEl.className = "aegis-tooltip hidden";
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}
const requestedHashes = /* @__PURE__ */ new Set();
function getPerkInfo(hash, localPerksMap) {
  if (localPerksMap[hash]) {
    return localPerksMap[hash];
  }
  const registryEl = document.getElementById("aegis-global-perk-registry");
  if (registryEl) {
    const registryStr = registryEl.getAttribute("data-registry");
    if (registryStr) {
      try {
        const registry = JSON.parse(registryStr);
        if (registry[hash]) {
          return registry[hash];
        }
      } catch (e) {
      }
    }
  }
  if (registryEl && !requestedHashes.has(hash)) {
    requestedHashes.add(hash);
    const currentRequests = registryEl.getAttribute("data-request-hashes") || "";
    const requestHashes = currentRequests ? currentRequests.split(",").map((h) => h.trim()).filter(Boolean) : [];
    if (!requestHashes.includes(String(hash))) {
      requestHashes.push(String(hash));
      registryEl.setAttribute("data-request-hashes", requestHashes.join(","));
    }
  }
  return {
    name: `Perk #${hash}`,
    icon: ""
  };
}
function positionTooltip(target, tooltip) {
  const targetRect = target.getBoundingClientRect();
  tooltip.style.visibility = "hidden";
  tooltip.classList.remove("hidden");
  const tooltipRect = tooltip.getBoundingClientRect();
  tooltip.classList.add("hidden");
  tooltip.style.visibility = "";
  const tooltipWidth = tooltipRect.width || 260;
  const tooltipHeight = tooltipRect.height || 180;
  let top = targetRect.top - tooltipHeight - 8;
  let left = targetRect.left + (targetRect.width - tooltipWidth) / 2;
  if (top < 8) {
    top = targetRect.bottom + 8;
  }
  if (left < 8) {
    left = 8;
  }
  const maxLeft = window.innerWidth - tooltipWidth - 8;
  if (left > maxLeft) {
    left = maxLeft;
  }
  tooltip.style.top = `${top + window.scrollY}px`;
  tooltip.style.left = `${left + window.scrollX}px`;
}
function showTooltip(target, result, weaponName, localPerksMap, activeHashes, isLightGG, sheetWeapon, bestAlternative, isBestInClass, sheetPerks, globalPerkNameToIcon) {
  const tooltip = getOrCreateTooltip();
  const isLightGGMode = !!isLightGG;
  const baseGradeLetter = result.grade ? result.grade.charAt(0).toLowerCase() : "";
  const gradeClass = `aegis-grade-${baseGradeLetter}`;
  let tagsHtml = "";
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
      tagsHtml += "</div>";
    }
  }
  let sheetMetaHtml = "";
  let sheetBodyHtml = "";
  if (sheetWeapon) {
    const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : "";
    const tierClass = `aegis-tier-${tierLetter}`;
    const rankText = sheetWeapon.rank ? `Rank #${sheetWeapon.rank}` : "";
    let categoryMetaText = "";
    if (isBestInClass) {
      categoryMetaText = `<span class="aegis-tooltip-best-tag">★ Best in Class</span>`;
    } else if (bestAlternative) {
      categoryMetaText = `<span class="aegis-tooltip-alt-text">Alt: ${bestAlternative}</span>`;
    }
    sheetMetaHtml = `
      <div class="aegis-tooltip-sheet-meta">
        <span class="aegis-tooltip-sheet-badge ${tierClass}">${sheetWeapon.tier} Tier</span>
        ${rankText ? `<span class="aegis-tooltip-sheet-rank">${rankText}</span>` : ""}
        ${categoryMetaText}
      </div>
    `;
    const cleanPerk1 = sheetWeapon.perk1 ? sheetWeapon.perk1.split("\n")[0].trim() : "";
    const cleanPerk2 = sheetWeapon.perk2 ? sheetWeapon.perk2.split("\n")[0].trim() : "";
    let recsHtml = "";
    if (cleanPerk1 || cleanPerk2) {
      const perksText = [cleanPerk1, cleanPerk2].filter(Boolean).join(" / ");
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
          ${sheetWeapon.notes ? `<div class="aegis-tooltip-meta-note">${sheetWeapon.notes}</div>` : ""}
        </div>
      `;
    }
  }
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
  let upgradeBannerHtml = "";
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
        const iconUrl = perk.icon ? `https://www.bungie.net${perk.icon}` : "";
        const itemClass = perk.matched ? "aegis-matched" : "aegis-selectable";
        const labelSuffix = perk.matched ? "" : ' <span class="aegis-selectable-suffix">(Selectable)</span>';
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
        let iconPath = perk.icon || "";
        if (!iconPath && globalPerkNameToIcon) {
          const normName = perk.name.toLowerCase().trim();
          const cleanName = normName.replace(/\s*\([^)]+\)\s*/g, "").replace(/[*+]/g, "").trim();
          iconPath = globalPerkNameToIcon[cleanName] || globalPerkNameToIcon[normName] || "";
        }
        const iconUrl = iconPath ? `https://www.bungie.net${iconPath}` : "";
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
        const iconUrl = info.icon ? `https://www.bungie.net${info.icon}` : "";
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
        const iconUrl = info.icon ? `https://www.bungie.net${info.icon}` : "";
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
    const JUNK_KEYWORDS = /tracker|empty|default|ornament|shader|catalyst|upgrade|mod socket|memento/i;
    let displayHashes = [];
    if (activeHashes && activeHashes.length > 0) {
      displayHashes = activeHashes.filter((hash) => {
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
    } else {
      for (const hash of displayHashes) {
        const info = localPerksMap[hash];
        const iconUrl = info.icon ? `https://www.bungie.net${info.icon}` : "";
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
        <div class="aegis-tooltip-section-title">${isLightGGMode ? "Information" : "Aegis Notes"}</div>
        <div class="aegis-tooltip-notes-text">${result.notes}</div>
      </div>
    `;
  }
  html += `
    </div>
  `;
  safeSetInnerHTML$1(tooltip, html);
  positionTooltip(target, tooltip);
  tooltip.classList.remove("hidden");
}
function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.classList.add("hidden");
  }
}
function safeSetInnerHTML(element, htmlString) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(htmlString, "text/html");
  element.replaceChildren(...Array.from(parsed.body.childNodes));
}
let wishlistDb = {};
let enhancedToNormalMap = {};
let scoringSource = "aegis";
let aegisLayoutSide = "side";
let aegisDbMode = "both";
let lightggDb = {};
let aegisSheetDb = null;
let hoveredElement = null;
let registryObserver = null;
let nameToHash = {};
let perkNameToIcon = {};
function updatePerkNameToIcon(perkRegistry) {
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
        const normName = roll.title.split("\n")[0].trim().toLowerCase();
        nameToHash[normName] = hash;
        const baseName = normName.replace(/\s*\([^)]+\)\s*$/, "").trim();
        nameToHash[baseName] = hash;
      }
    }
  }
}
function setupRegistryObserver() {
  if (registryObserver) return;
  const registryEl = document.getElementById("aegis-global-perk-registry");
  if (!registryEl) return;
  registryObserver = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (mutation.type === "attributes" && mutation.attributeName === "data-registry") {
        const registryStr = registryEl.getAttribute("data-registry");
        if (registryStr) {
          try {
            const parsed = JSON.parse(registryStr);
            chrome.storage.local.set({ perkRegistry: parsed });
            updatePerkNameToIcon(parsed);
          } catch (e) {
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
            showTooltip(
              hoveredElement,
              result,
              name,
              perksMap,
              activeHashes,
              scoringSource === "lightgg",
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
    attributeFilter: ["data-registry"]
  });
}
function cleanPerkName(name) {
  return (name ?? "").toLowerCase().replace(/\s*\([^)]+\)\s*/g, "").replace(/[*+]/g, "").trim();
}
function findAegisWeapon(name) {
  if (!aegisSheetDb || !aegisSheetDb.weapons) return null;
  const normalized = name.split("\n")[0].trim().toLowerCase();
  const baseNormalized = normalized.replace(/\s*\([^)]+\)\s*$/, "").trim();
  return aegisSheetDb.weapons[normalized] || aegisSheetDb.weapons[baseNormalized] || null;
}
function findWeaponCategory(weaponName) {
  if (!aegisSheetDb || !aegisSheetDb.categories) return "";
  const norm = weaponName.split("\n")[0].trim().toLowerCase();
  const baseNorm = norm.replace(/\s*\([^)]+\)\s*$/, "").trim();
  for (const [tab, list] of Object.entries(aegisSheetDb.categories)) {
    if (list.some((w) => {
      const n = w.name.toLowerCase();
      return n === norm || n === baseNorm;
    })) {
      return tab;
    }
  }
  return "";
}
function findSuperiors(categoryTab, currentEnergy, currentFrame) {
  if (!aegisSheetDb || !aegisSheetDb.categories || !categoryTab) {
    return { byEnergy: null, byFrame: null, byBoth: null };
  }
  const list = aegisSheetDb.categories[categoryTab] || [];
  const normEnergy = currentEnergy.toLowerCase().trim();
  const normFrame = currentFrame.toLowerCase().replace(/ frame$/, "").trim();
  const byEnergy = list.find((w) => w.energy.toLowerCase().trim() === normEnergy) || null;
  const byFrame = list.find((w) => w.frame.toLowerCase().replace(/ frame$/, "").trim() === normFrame) || null;
  const byBoth = list.find(
    (w) => w.energy.toLowerCase().trim() === normEnergy && w.frame.toLowerCase().replace(/ frame$/, "").trim() === normFrame
  ) || null;
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
  const pNameClean = perkName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const rNameClean = recName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!pNameClean || !rNameClean) return false;
  const pWords = pNameClean.split(" ");
  const rWords = rNameClean.split(" ");
  const pStripped = pNameClean.replace(/\s+/g, "");
  const rStripped = rNameClean.replace(/\s+/g, "");
  if (pStripped === rStripped) return true;
  if (isWordSubsequence(rWords, pWords)) return true;
  if (isWordSubsequence(pWords, rWords)) return true;
  return false;
}
function computeGrade(p1, p2, mag, barrel, origin, treatSelectableAsActive) {
  const effectiveP1 = p1 === "active" || treatSelectableAsActive && p1 === "selectable";
  const effectiveP2 = p2 === "active" || treatSelectableAsActive && p2 === "selectable";
  const effectiveMag = mag === "active" || treatSelectableAsActive && mag === "selectable";
  const effectiveBarrel = barrel === "active" || treatSelectableAsActive && barrel === "selectable";
  const effectiveOrigin = origin === "active" || treatSelectableAsActive && origin === "selectable";
  const activeTraitsCount = (p1 === "active" ? 1 : 0) + (p2 === "active" ? 1 : 0);
  const selectableTraitsCount = (p1 === "selectable" ? 1 : 0) + (p2 === "selectable" ? 1 : 0);
  const hasActiveMag = mag === "active";
  const hasActiveBarrel = barrel === "active";
  if (effectiveP1 && effectiveP2 && effectiveMag && effectiveBarrel && effectiveOrigin) {
    return "S+";
  }
  if (effectiveP1 && effectiveP2 && effectiveMag) {
    return "S";
  }
  if (effectiveP1 && effectiveP2 && effectiveBarrel) {
    return "A+";
  }
  if (effectiveP1 && effectiveP2) {
    return "A";
  }
  if (!treatSelectableAsActive) {
    if (activeTraitsCount === 1 && selectableTraitsCount === 1 && (hasActiveMag || hasActiveBarrel)) {
      return "B+";
    }
    if (activeTraitsCount === 1 && selectableTraitsCount === 1) {
      return "B";
    }
  }
  const effectiveActiveTraitsCount = (effectiveP1 ? 1 : 0) + (effectiveP2 ? 1 : 0);
  if (effectiveActiveTraitsCount === 1 && (effectiveMag || effectiveBarrel)) {
    return "C";
  }
  if (effectiveActiveTraitsCount === 1 || !treatSelectableAsActive && selectableTraitsCount === 1) {
    return "D";
  }
  return "F";
}
function evaluateCategoryPerks(recString, availablePerks, perksMap) {
  var _a;
  if (!recString || recString.trim() === "" || recString.trim() === "-" || recString.toLowerCase() === "none") {
    return [];
  }
  const recs = recString.split(/[\/\n]+/).map((s) => s.trim()).filter(Boolean);
  const results = [];
  for (const rawRec of recs) {
    const rec = cleanPerkName(rawRec);
    if (!rec) continue;
    let foundPerk = null;
    for (const perk of availablePerks) {
      if (perk.active && isPerkMatch(perk.name, rec)) {
        foundPerk = perk;
        break;
      }
    }
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
        name: ((_a = perksMap[foundPerk.hash]) == null ? void 0 : _a.name) || foundPerk.name,
        icon: foundPerk.icon,
        matched: true,
        status: foundPerk.active ? "active" : "selectable"
      });
    } else {
      const displayName = rawRec.replace(/\b\w/g, (c) => c.toUpperCase());
      const missingIcon = perkNameToIcon[rec] || perkNameToIcon[displayName.toLowerCase().trim()];
      results.push({
        name: displayName,
        icon: missingIcon || void 0,
        matched: false,
        status: "missing"
      });
    }
  }
  return results;
}
function getSlotStatusFromEvaluations(evals) {
  if (evals.length === 0) {
    return "active";
  }
  if (evals.some((e) => e.status === "active")) {
    return "active";
  }
  if (evals.some((e) => e.status === "selectable")) {
    return "selectable";
  }
  return "missing";
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
        active: activeHashes.includes(hash)
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
    if (s === "active") pct += 25;
    else if (s === "selectable") pct += 15;
  }
  const matchedList = [];
  const missingList = [];
  const categories = [
    { type: "barrel", evals: barrelEvals },
    { type: "mag", evals: magEvals },
    { type: "perk1", evals: p1Evals },
    { type: "perk2", evals: p2Evals },
    { type: "origin", evals: originEvals }
  ];
  const selectablePerkNames = [];
  for (const cat of categories) {
    for (const perk of cat.evals) {
      const tooltipPerk = {
        name: perk.name,
        icon: perk.icon,
        matched: perk.matched,
        type: cat.type,
        status: perk.status
      };
      if (perk.status === "active" || perk.status === "selectable") {
        matchedList.push(tooltipPerk);
        if (perk.status === "selectable") {
          const formattedName = perk.name.replace(/\b\w/g, (c) => c.toUpperCase());
          if (!selectablePerkNames.includes(formattedName)) {
            selectablePerkNames.push(formattedName);
          }
        }
      } else {
        missingList.push(tooltipPerk);
      }
    }
  }
  let upgradeAdvice = "";
  const gradeOrder = ["F", "D", "C", "B", "B+", "A", "A+", "S", "S+"];
  const curIdx = gradeOrder.indexOf(currentGrade);
  const potIdx = gradeOrder.indexOf(potentialGrade);
  if (potIdx > curIdx && selectablePerkNames.length > 0) {
    const perksStr = selectablePerkNames.join(" or ");
    upgradeAdvice = `💡 Upgrade available: Select ${perksStr} to rank up to ${potentialGrade}!`;
  }
  const finalGrade = currentGrade;
  return {
    result: {
      grade: finalGrade,
      matchPercentage: pct,
      matchedPerks: [],
      missingPerks: [],
      notes: sheetWeapon.notes || "",
      wishlistPerks: []
    },
    potentialGrade,
    upgradeAdvice,
    sheetPerks: { matched: matchedList, missing: missingList }
  };
}
function populateFramesFilter(selectedCat) {
  if (!aegisSheetDb) return;
  const frameSelect = document.querySelector(".aegis-explorer-frame-select");
  if (!frameSelect) return;
  const prevValue = frameSelect.value;
  while (frameSelect.children.length > 1) {
    frameSelect.removeChild(frameSelect.lastChild);
  }
  const frames = /* @__PURE__ */ new Set();
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
    const opt = document.createElement("option");
    opt.value = frame;
    opt.textContent = frame;
    frameSelect.appendChild(opt);
  }
  if (frames.has(prevValue)) {
    frameSelect.value = prevValue;
  } else {
    frameSelect.value = "";
  }
}
function populateFilters() {
  if (!aegisSheetDb || !aegisSheetDb.categories) return;
  const catSelect = document.querySelector(".aegis-explorer-category-select");
  if (catSelect && catSelect.children.length <= 1) {
    const categories = Object.keys(aegisSheetDb.categories).sort();
    for (const cat of categories) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    }
  }
  populateFramesFilter(catSelect ? catSelect.value : "");
}
function renderResults() {
  const resultsContainer = document.querySelector(".aegis-explorer-results");
  if (!resultsContainer) return;
  if (!aegisSheetDb || !aegisSheetDb.weapons) {
    resultsContainer.innerHTML = '<div class="aegis-explorer-empty">Loading database...</div>';
    return;
  }
  const searchInput = document.querySelector(".aegis-explorer-search-input");
  const catSelect = document.querySelector(".aegis-explorer-category-select");
  const frameSelect = document.querySelector(".aegis-explorer-frame-select");
  const elementSelect = document.querySelector(".aegis-explorer-element-select");
  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const selectedCat = catSelect ? catSelect.value : "";
  const selectedFrame = frameSelect ? frameSelect.value : "";
  const selectedElement = elementSelect ? elementSelect.value : "";
  const matches = [];
  for (const [cat, list] of Object.entries(aegisSheetDb.categories)) {
    if (selectedCat && cat !== selectedCat) continue;
    for (const w of list) {
      if (selectedFrame && w.frame !== selectedFrame) continue;
      if (selectedElement && w.energy.toLowerCase().trim() !== selectedElement.toLowerCase().trim()) continue;
      if (query) {
        const nameMatch = w.name.toLowerCase().includes(query);
        const notesMatch = w.notes.toLowerCase().includes(query);
        const frameMatch = w.frame.toLowerCase().includes(query);
        const perksMatch = (w.perk1 + " " + w.perk2).toLowerCase().includes(query);
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
  let html = "";
  for (const m of matches) {
    const w = m.weapon;
    const tierLetter = w.tier ? w.tier.charAt(0).toLowerCase() : "";
    const tierClass = `aegis-tier-${tierLetter}`;
    const rankLabel = w.rank ? `#${w.rank}` : "-";
    const normName = w.name.toLowerCase().trim();
    const baseName = normName.replace(/\s*\([^)]+\)\s*$/, "").trim();
    const weaponHash = nameToHash[normName] || nameToHash[baseName];
    let destinyReportBtnHtml = "";
    if (weaponHash) {
      destinyReportBtnHtml = `<a class="aegis-action-btn aegis-btn-report" href="https://destiny.report/w/${weaponHash}" target="_blank" rel="noopener noreferrer">Destiny.Report ↗</a>`;
    } else {
      destinyReportBtnHtml = `<button class="aegis-action-btn aegis-btn-disabled" title="Weapon ID not resolved. Ensure the weapon is in your wishlist or has been viewed/scanned on screen in DIM." disabled>Destiny.Report (Unknown ID)</button>`;
    }
    html += `
      <div class="aegis-explorer-row" data-weapon-name="${w.name.replace(/"/g, "&quot;")}">
        <div class="aegis-explorer-row-header">
          <span class="aegis-explorer-row-name">${w.name}</span>
          <div class="aegis-explorer-row-badges">
            <span class="aegis-explorer-row-badge ${tierClass}">${w.tier || "F"}</span>
            <span class="aegis-explorer-row-rank">${rankLabel}</span>
          </div>
        </div>
        <div class="aegis-explorer-row-details">
          <span class="aegis-explorer-row-meta">${w.energy} / ${w.frame}</span>
          <span class="aegis-explorer-row-cat">${m.category}</span>
        </div>
        ${w.notes ? `<div class="aegis-explorer-row-notes">${w.notes}</div>` : ""}
        <div class="aegis-explorer-row-actions">
          <button class="aegis-action-btn aegis-btn-highlight" data-action="filter-vault">Filter in Vault</button>
          ${destinyReportBtnHtml}
        </div>
      </div>
    `;
  }
  resultsContainer.innerHTML = html;
  const rows = resultsContainer.querySelectorAll(".aegis-explorer-row");
  rows.forEach((row) => {
    row.addEventListener("click", (e) => {
      const target = e.target;
      if (target.closest(".aegis-explorer-row-actions")) {
        return;
      }
      rows.forEach((otherRow) => {
        if (otherRow !== row) {
          otherRow.classList.remove("expanded");
        }
      });
      row.classList.toggle("expanded");
    });
    const filterBtn = row.querySelector('[data-action="filter-vault"]');
    if (filterBtn) {
      filterBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const name = row.getAttribute("data-weapon-name");
        if (name) {
          triggerDimSearch(name);
        }
      });
    }
    const reportBtn = row.querySelector(".aegis-btn-report");
    if (reportBtn) {
      reportBtn.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }
  });
}
function triggerDimSearch(weaponName) {
  const searchInput = document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]');
  if (searchInput) {
    searchInput.value = `name:"${weaponName}"`;
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    const wrapper = searchInput.parentElement;
    if (wrapper) {
      wrapper.classList.remove("aegis-search-flash");
      void wrapper.offsetWidth;
      wrapper.classList.add("aegis-search-flash");
    }
  }
}
function initAegisExplorer() {
  if (!document.body || document.querySelector(".aegis-fab")) return;
  const fab = document.createElement("div");
  fab.className = "aegis-fab";
  fab.title = "Open Aegis Database Explorer";
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffd700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  `;
  const panel = document.createElement("div");
  panel.className = "aegis-explorer-panel";
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
  const closeBtn = panel.querySelector(".aegis-explorer-close");
  const searchInput = panel.querySelector(".aegis-explorer-search-input");
  const catSelect = panel.querySelector(".aegis-explorer-category-select");
  const frameSelect = panel.querySelector(".aegis-explorer-frame-select");
  const elementSelect = panel.querySelector(".aegis-explorer-element-select");
  fab.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      populateFilters();
      renderResults();
    }
  });
  closeBtn == null ? void 0 : closeBtn.addEventListener("click", () => {
    panel.classList.remove("open");
  });
  const onUpdate = () => {
    renderResults();
  };
  searchInput == null ? void 0 : searchInput.addEventListener("input", onUpdate);
  catSelect == null ? void 0 : catSelect.addEventListener("change", () => {
    populateFramesFilter(catSelect.value);
    onUpdate();
  });
  frameSelect == null ? void 0 : frameSelect.addEventListener("change", onUpdate);
  elementSelect == null ? void 0 : elementSelect.addEventListener("change", onUpdate);
}
chrome.storage.local.get(["wishlistData", "enhancedToNormal", "scoringSource", "lightggData", "aegisSheetDb", "perkRegistry", "aegisLayoutSide", "aegisDbMode"], (res) => {
  wishlistDb = res.wishlistData || {};
  enhancedToNormalMap = res.enhancedToNormal || {};
  scoringSource = res.scoringSource || "aegis";
  aegisLayoutSide = res.aegisLayoutSide || "side";
  aegisDbMode = res.aegisDbMode || "both";
  lightggDb = res.lightggData || {};
  aegisSheetDb = res.aegisSheetDb || null;
  console.log(`DIM Aegis Overlay: Loaded configuration. Source: ${scoringSource}`);
  updateNameToHashFromWishlist();
  updatePerkNameToIcon(res.perkRegistry || {});
  reprocessAllElements();
  initAegisExplorer();
});
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local") {
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
      scoringSource = changes.scoringSource.newValue || "aegis";
      changed = true;
    }
    if (changes.aegisLayoutSide) {
      aegisLayoutSide = changes.aegisLayoutSide.newValue || "side";
      changed = true;
    }
    if (changes.aegisDbMode) {
      aegisDbMode = changes.aegisDbMode.newValue || "both";
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
      console.log("DIM Aegis Overlay: Storage updated, re-scoring elements.");
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
    showTooltip(
      el,
      result,
      name,
      perksMap,
      activeHashes,
      scoringSource === "lightgg",
      sheetWeapon,
      bestAlternative,
      isBestInClass,
      sheetPerks,
      perkNameToIcon
    );
  }
}
function handleMouseLeave() {
  hoveredElement = null;
  hideTooltip();
}
function injectPopupSummary(popupContainer, result, scoringSource2, sheetWeapon, sheetPerks) {
  var _a, _b, _c;
  const titleEl = popupContainer.querySelector('h1, [class*="title"]');
  if (!titleEl) return;
  const header = titleEl.parentElement;
  if (!header) return;
  popupContainer.querySelectorAll('[data-aegis-details="true"]').forEach((el) => el.remove());
  let summaryEl = popupContainer.querySelector(".aegis-popup-summary");
  if (!result.grade) {
    if (summaryEl) summaryEl.remove();
    return;
  }
  if (!summaryEl) {
    summaryEl = document.createElement("div");
    summaryEl.className = "aegis-popup-summary";
    titleEl.insertAdjacentElement("afterend", summaryEl);
  }
  const baseGradeLetter = result.grade.charAt(0).toLowerCase();
  const gradeClass = `aegis-grade-${baseGradeLetter}`;
  const isLightGG = scoringSource2 === "lightgg";
  let notesHtml = "";
  if (result.notes) {
    notesHtml = `<div class="aegis-popup-notes-text">${result.notes}</div>`;
  }
  let upgradeAdviceHtml = "";
  if (result.upgradeAdvice) {
    upgradeAdviceHtml = `
      <div class="aegis-popup-upgrade-banner">
        ${result.upgradeAdvice}
      </div>
    `;
  }
  const matchLabel = isLightGG ? "Light.gg Roll Appraisal" : `Wishlist Match: <strong class="${gradeClass}">${result.matchPercentage}%</strong>`;
  const weaponName = ((_b = (_a = titleEl.querySelector("span")) == null ? void 0 : _a.textContent) == null ? void 0 : _b.trim()) || ((_c = titleEl.textContent) == null ? void 0 : _c.trim()) || "";
  let sheetMetaHtml = "";
  if (sheetWeapon) {
    const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : "";
    const tierClass = `aegis-tier-${tierLetter}`;
    const rankLabel = sheetWeapon.rank ? `Rank #${sheetWeapon.rank} in Category` : "";
    sheetMetaHtml = `
      <div class="aegis-popup-meta-divider"></div>
      <div class="aegis-popup-meta-content">
        <div class="aegis-popup-row">
          <span class="aegis-popup-meta-badge ${tierClass}">${sheetWeapon.tier} Tier</span>
          ${rankLabel ? `<span class="aegis-popup-meta-rank">${rankLabel}</span>` : ""}
        </div>
        ${sheetWeapon.notes ? `<div class="aegis-popup-notes-text aegis-meta-notes"><strong>Aegis Meta:</strong> ${sheetWeapon.notes}</div>` : ""}
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
  if (sheetWeapon) {
    const categoryTab = findWeaponCategory(weaponName);
    const superiors = findSuperiors(categoryTab, sheetWeapon.energy, sheetWeapon.frame);
    const perksBtn = popupContainer.querySelector('button[title*="perks" i], button[title*="Perks" i]');
    const perksSection = perksBtn == null ? void 0 : perksBtn.parentElement;
    const sockets = popupContainer.querySelector('[class*="sockets" i], [class*="Sockets" i]');
    const insertTarget = perksSection || sockets;
    if (insertTarget) {
      const detailsCard = document.createElement("div");
      detailsCard.className = "aegis-popup-details-card";
      detailsCard.setAttribute("data-aegis-details", "true");
      let perksRowsHtml = "";
      const items = [
        { label: "Barrel", type: "barrel", rawVal: sheetWeapon.barrel },
        { label: "Mag", type: "mag", rawVal: sheetWeapon.mag },
        { label: "Perk 1", type: "perk1", rawVal: sheetWeapon.perk1 },
        { label: "Perk 2", type: "perk2", rawVal: sheetWeapon.perk2 },
        { label: "Origin", type: "origin", rawVal: sheetWeapon.origin }
      ];
      for (const item of items) {
        if (!item.rawVal) continue;
        let chipsHtml = "";
        if (sheetPerks) {
          const matched = sheetPerks.matched.filter((p) => p.type === item.type);
          const missing = sheetPerks.missing.filter((p) => p.type === item.type);
          for (const perk of matched) {
            const statusClass = perk.status === "active" ? "aegis-chip-active" : "aegis-chip-selectable";
            const iconHtml = perk.icon ? `<img src="https://www.bungie.net${perk.icon}" class="aegis-chip-icon" />` : "";
            const statusLabel = perk.status === "active" ? "" : " (Selectable)";
            chipsHtml += `
              <span class="aegis-perk-chip ${statusClass}" title="${perk.name}${statusLabel}">
                ${iconHtml}
                <span class="aegis-chip-name">${perk.name}</span>
              </span>
            `;
          }
          for (const perk of missing) {
            const iconHtml = perk.icon ? `<img src="https://www.bungie.net${perk.icon}" class="aegis-chip-icon" />` : "";
            chipsHtml += `
              <span class="aegis-perk-chip aegis-chip-missing" title="${perk.name} (Missing)">
                ${iconHtml}
                <span class="aegis-chip-name">${perk.name}</span>
              </span>
            `;
          }
        }
        if (!chipsHtml) {
          const cleanVal = item.rawVal.split(/[\/\n]+/).map((s) => s.trim()).filter(Boolean).join(" / ");
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
      let superiorsHtml = "";
      if (superiors.byEnergy || superiors.byFrame || superiors.byBoth) {
        const uniqueSups = /* @__PURE__ */ new Map();
        const addUniqueSup = (label, supW) => {
          if (!supW) return;
          const key = supW.name.toLowerCase();
          if (uniqueSups.has(key)) {
            uniqueSups.get(key).labels.push(label);
          } else {
            uniqueSups.set(key, { weapon: supW, labels: [label] });
          }
        };
        if (sheetWeapon.energy) addUniqueSup(sheetWeapon.energy, superiors.byEnergy);
        if (sheetWeapon.frame) addUniqueSup(sheetWeapon.frame, superiors.byFrame);
        if (sheetWeapon.energy && sheetWeapon.frame) {
          addUniqueSup(`${sheetWeapon.energy} ${sheetWeapon.frame}`, superiors.byBoth);
        }
        let supRowsHtml = "";
        for (const item of uniqueSups.values()) {
          const isSelf = item.weapon.name.toLowerCase() === sheetWeapon.name.toLowerCase();
          const selfClass = isSelf ? "aegis-sup-self" : "";
          const labelsStr = item.labels.join(" / ");
          const tierLetter = item.weapon.tier ? item.weapon.tier.charAt(0).toLowerCase() : "";
          const tierBadgeHtml = `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${item.weapon.tier}</span>`;
          const rankHtml = item.weapon.rank ? `<span class="aegis-sup-rank-num">#${item.weapon.rank}</span>` : "";
          const currentLabel = isSelf ? '<span class="aegis-current-badge">(Current)</span>' : "";
          supRowsHtml += `
            <div class="aegis-details-row aegis-sup-row ${isSelf ? "aegis-sup-row-self" : ""}">
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
          const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : "";
          const tierBadgeHtml = `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${sheetWeapon.tier}</span>`;
          const rankHtml = sheetWeapon.rank ? `<span class="aegis-sup-rank-num">#${sheetWeapon.rank}</span>` : "";
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
          <div class="aegis-details-body aegis-perks-body" style="margin-bottom: ${superiorsHtml ? "10px" : "0"};">
            ${perksRowsHtml}
          </div>
          ${superiorsHtml}
        `
        );
        const rect = popupContainer.getBoundingClientRect();
        const spaceLeft = rect.left;
        const spaceRight = window.innerWidth - rect.right;
        if (aegisLayoutSide === "side" && window.innerWidth >= 1e3 && (spaceLeft >= 330 || spaceRight >= 330)) {
          detailsCard.classList.add("aegis-side-panel");
          popupContainer.appendChild(detailsCard);
          detailsCard.style.setProperty("position", "absolute", "important");
          detailsCard.style.setProperty("top", "55px", "important");
          if (spaceLeft >= 330) {
            detailsCard.style.setProperty("left", "-320px", "important");
            detailsCard.style.setProperty("right", "auto", "important");
          } else {
            detailsCard.style.setProperty("left", "auto", "important");
            detailsCard.style.setProperty("right", "-320px", "important");
          }
        } else {
          detailsCard.classList.remove("aegis-side-panel");
          detailsCard.style.removeProperty("position");
          detailsCard.style.removeProperty("top");
          detailsCard.style.removeProperty("left");
          detailsCard.style.removeProperty("right");
          insertTarget.after(detailsCard);
        }
      }
    }
  }
}
function injectBadge(el, result) {
  let badgeTarget = el.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"]');
  if (badgeTarget) {
    badgeTarget.style.setProperty("position", "relative", "important");
  } else {
    badgeTarget = el;
  }
  if (badgeTarget) {
    badgeTarget.classList.remove("aegis-gold-glow");
    if (result.grade && result.grade.startsWith("S")) {
      badgeTarget.classList.add("aegis-gold-glow");
    }
  }
  let badge = badgeTarget.querySelector(".aegis-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "aegis-badge";
    badgeTarget.appendChild(badge);
  }
  badge.classList.remove("aegis-badge-s", "aegis-badge-a", "aegis-badge-b", "aegis-badge-c", "aegis-badge-d", "aegis-badge-f");
  const baseLetter = result.grade ? result.grade.charAt(0).toLowerCase() : "";
  badge.classList.add(`aegis-badge-${baseLetter}`);
  badge.textContent = result.grade || "";
}
function removeBadge(el) {
  let badgeTarget = el.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"]');
  if (badgeTarget) {
    badgeTarget.classList.remove("aegis-gold-glow");
  } else {
    el.classList.remove("aegis-gold-glow");
  }
  const badge = el.querySelector(".aegis-badge");
  if (badge) {
    badge.remove();
  }
}
function processElement(el) {
  var _a;
  const parentWrapper = (_a = el.parentElement) == null ? void 0 : _a.closest("[data-aegis-item-hash]");
  if (parentWrapper) {
    removeBadge(el);
    if (el.hasAttribute("data-aegis-listeners")) {
      el.removeEventListener("mouseenter", handleMouseEnter);
      el.removeEventListener("mouseleave", handleMouseLeave);
      el.removeAttribute("data-aegis-listeners");
    }
    return;
  }
  const itemHashStr = el.getAttribute("data-aegis-item-hash");
  const weaponName = el.getAttribute("data-aegis-item-name") || "Unknown Weapon";
  const perkHashesStr = el.getAttribute("data-aegis-perk-hashes");
  const perksDataStr = el.getAttribute("data-aegis-perks-data");
  if (itemHashStr && weaponName && weaponName !== "Unknown Weapon") {
    const hash = parseInt(itemHashStr, 10);
    if (!isNaN(hash)) {
      const normName = weaponName.toLowerCase().trim();
      nameToHash[normName] = hash;
      const baseName = normName.replace(/\s*\([^)]+\)\s*$/, "").trim();
      nameToHash[baseName] = hash;
    }
  }
  if (!itemHashStr || !perkHashesStr) {
    return;
  }
  try {
    const itemHash = parseInt(itemHashStr, 10);
    const perkHashes = perkHashesStr.split(",").map((h) => parseInt(h.trim(), 10)).filter((h) => !isNaN(h));
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
    const activePerksDataStr = el.getAttribute("data-aegis-active-perk-hashes");
    let activeHashes = [];
    if (activePerksDataStr) {
      activeHashes = activePerksDataStr.split(",").map(Number).filter((h) => !isNaN(h) && h > 0);
    }
    let result;
    let sheetPerks = void 0;
    const sheetWeapon = findAegisWeapon(weaponName);
    let bestAlternative = void 0;
    let isBestInClass = false;
    if (scoringSource === "lightgg") {
      const rawInstanceId = el.getAttribute("data-aegis-instance-id") || el.id.replace("item-", "");
      const instanceId = rawInstanceId.replace(/^[^0-9]+/, "");
      const grade = lightggDb[instanceId];
      if (grade) {
        let aegisResult;
        const useSheet = sheetWeapon && aegisDbMode !== "wishlist";
        if (useSheet) {
          const sheetScore = scoreSheetWeapon(sheetWeapon, perksMap, activeHashes);
          aegisResult = sheetScore.result;
          sheetPerks = sheetScore.sheetPerks;
          aegisResult.upgradeAdvice = sheetScore.upgradeAdvice;
          aegisResult.potentialGrade = sheetScore.potentialGrade;
        } else {
          aegisResult = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
        }
        result = {
          grade,
          matchPercentage: aegisResult.grade ? aegisResult.matchPercentage : 100,
          matchedPerks: aegisResult.matchedPerks,
          missingPerks: aegisResult.missingPerks,
          notes: aegisResult.notes || "Community popularity rating from Light.gg Roll Appraiser.",
          wishlistPerks: aegisResult.wishlistPerks,
          upgradeAdvice: aegisResult.upgradeAdvice,
          potentialGrade: aegisResult.potentialGrade
        };
      } else {
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: "",
          wishlistPerks: []
        };
      }
    } else {
      const useSheet = sheetWeapon && aegisDbMode !== "wishlist";
      const useWishlist = aegisDbMode !== "spreadsheet";
      if (useSheet) {
        const sheetScore = scoreSheetWeapon(sheetWeapon, perksMap, activeHashes);
        result = sheetScore.result;
        sheetPerks = sheetScore.sheetPerks;
        result.upgradeAdvice = sheetScore.upgradeAdvice;
        result.potentialGrade = sheetScore.potentialGrade;
      } else if (useWishlist) {
        result = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
      } else {
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: "",
          wishlistPerks: []
        };
      }
    }
    const hasSheetData = sheetWeapon && aegisDbMode !== "wishlist";
    if (hasSheetData) {
      const categoryTab = findWeaponCategory(weaponName);
      const superiors = findSuperiors(categoryTab, sheetWeapon.energy, sheetWeapon.frame);
      const bestW = superiors.byBoth || superiors.byFrame || superiors.byEnergy;
      if (bestW) {
        if (bestW.name.toLowerCase() === sheetWeapon.name.toLowerCase()) {
          isBestInClass = true;
        } else {
          bestAlternative = `${bestW.name} (${bestW.tier} #${bestW.rank})`;
        }
      }
    }
    el._aegisResult = result;
    el._aegisName = weaponName;
    el._aegisPerksMap = perksMap;
    el._aegisActiveHashes = activeHashes;
    el._aegisSheetWeapon = hasSheetData ? sheetWeapon : null;
    el._aegisBestAlternative = bestAlternative;
    el._aegisIsBestInClass = isBestInClass;
    el._aegisSheetPerks = hasSheetData ? sheetPerks : null;
    if (result.grade) {
      const isPopup = el.matches('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      if (!isPopup) {
        injectBadge(el, result);
      }
      const popupContainer = isPopup ? el : el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      if (popupContainer) {
        injectPopupSummary(popupContainer, result, scoringSource, sheetWeapon || void 0, sheetPerks);
      }
      if (!isPopup && !el.hasAttribute("data-aegis-listeners")) {
        el.addEventListener("mouseenter", handleMouseEnter);
        el.addEventListener("mouseleave", handleMouseLeave);
        el.setAttribute("data-aegis-listeners", "true");
      }
    } else {
      removeBadge(el);
      const popupContainer = el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      if (popupContainer) {
        const summary = popupContainer.querySelector(".aegis-popup-summary");
        if (summary) summary.remove();
      }
      if (el.hasAttribute("data-aegis-listeners")) {
        el.removeEventListener("mouseenter", handleMouseEnter);
        el.removeEventListener("mouseleave", handleMouseLeave);
        el.removeAttribute("data-aegis-listeners");
      }
    }
  } catch (err) {
    console.error("Error processing element in content script:", err);
  }
}
function reprocessAllElements() {
  setupRegistryObserver();
  const elements = document.querySelectorAll("[data-aegis-item-hash]");
  for (let i = 0; i < elements.length; i++) {
    processElement(elements[i]);
  }
}
const observer = new MutationObserver((mutations) => {
  for (let i = 0; i < mutations.length; i++) {
    const mutation = mutations[i];
    if (mutation.type === "attributes" && (mutation.attributeName === "data-aegis-item-hash" || mutation.attributeName === "data-aegis-perk-hashes")) {
      processElement(mutation.target);
    }
    if (mutation.type === "childList") {
      setupRegistryObserver();
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.hasAttribute("data-aegis-item-hash")) {
            processElement(node);
          }
          const children = node.querySelectorAll("[data-aegis-item-hash]");
          children.forEach((child) => processElement(child));
        }
      });
    }
  }
});
function startObserver() {
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    return;
  }
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-aegis-item-hash", "data-aegis-perk-hashes"]
  });
}
startObserver();
reprocessAllElements();
