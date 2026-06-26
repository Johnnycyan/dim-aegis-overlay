let completionSignaled = false;
let apiGradesReceived = false;
let completionTimer = null;
function saveGrades(grades, source) {
  const count = Object.keys(grades).length;
  if (count === 0) return;
  chrome.storage.local.get("lightggData", (res) => {
    const existing = res.lightggData || {};
    let changed = false;
    for (const [id, grade] of Object.entries(grades)) {
      if (existing[id] !== grade) {
        existing[id] = grade;
        changed = true;
      }
    }
    if (!changed) return;
    const total = Object.keys(existing).length;
    chrome.storage.local.set({ lightggData: existing, lightggLastSync: Date.now() }, () => {
      console.log(`[DIM Aegis Overlay LGG] [${source}] Saved ${count} new/updated grades. Total cached: ${total}`);
    });
  });
}
function signalCompletion() {
  if (completionSignaled) return;
  completionSignaled = true;
  console.log("[DIM Aegis Overlay LGG] Signaling completion to background script.");
  chrome.storage.local.set({ lightggSyncStatus: "done", lightggLastSync: Date.now() });
}
document.addEventListener("__aegis_lgg_grades__", (e) => {
  const { grades, source } = e.detail;
  if (grades && Object.keys(grades).length > 0) {
    apiGradesReceived = true;
    saveGrades(grades, `api-intercept:${source}`);
    if (completionTimer) clearTimeout(completionTimer);
    completionTimer = setTimeout(() => {
      signalCompletion();
    }, 4e3);
  }
});
function scrapeLightGGGrades() {
  const gradesMap = {};
  const allElements = document.getElementsByTagName("*");
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    let instanceId = "";
    if (el.attributes) {
      for (let a = 0; a < el.attributes.length; a++) {
        const attr = el.attributes[a];
        if (attr.value) {
          const match = attr.value.match(/\d{18,20}/);
          if (match) {
            instanceId = match[0];
            break;
          }
        }
      }
    }
    if (!instanceId) continue;
    let grade = "";
    let current = el;
    for (let depth = 0; depth < 5; depth++) {
      if (!current) break;
      const qualityImg = current.querySelector("img.quality");
      if (qualityImg) {
        const title = qualityImg.getAttribute("title");
        if (title) {
          const titleMatch = title.match(/\(([SABCDF][+-]?)\)/i);
          if (titleMatch) grade = titleMatch[1].toUpperCase();
        }
        if (!grade) {
          const src = qualityImg.getAttribute("src");
          if (src) {
            const srcMatch = decodeURIComponent(src).match(/quality-(.+)-text\.svg/i);
            if (srcMatch) grade = srcMatch[1].toUpperCase();
          }
        }
      }
      if (!grade) {
        const tagsEl = current.querySelector(".tags");
        if (tagsEl && tagsEl.textContent) {
          const parts = tagsEl.textContent.trim().split(/\s+/);
          const lastWord = parts[parts.length - 1];
          if (/^(S\+|[SABCDF][+-]?)$/i.test(lastWord)) {
            grade = lastWord.toUpperCase();
          }
        }
      }
      if (!grade) {
        const hasGodClass = current.querySelector(".god") !== null;
        const hasGodText = current.textContent && /God\s+Roll/i.test(current.textContent);
        if (hasGodClass || hasGodText) grade = "S+";
      }
      if (grade) break;
      current = current.parentElement;
    }
    if (grade) {
      gradesMap[instanceId] = grade;
    }
  }
  return gradesMap;
}
let lastDomCount = 0;
let lastDebugLog = 0;
function runDomScrape() {
  try {
    const grades = scrapeLightGGGrades();
    const count = Object.keys(grades).length;
    const now = Date.now();
    if (count > 0 && count !== lastDomCount) {
      lastDomCount = count;
      saveGrades(grades, "dom-scrape");
      if (!apiGradesReceived) {
        if (completionTimer) clearTimeout(completionTimer);
        completionTimer = setTimeout(() => {
          signalCompletion();
        }, 5e3);
      }
    } else if (count === 0 && now - lastDebugLog > 1e4) {
      lastDebugLog = now;
      const allElements = document.getElementsByTagName("*");
      let candidateCount = 0;
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        if (el.attributes) {
          for (let a = 0; a < el.attributes.length; a++) {
            if (el.attributes[a].value && /\d{18,20}/.test(el.attributes[a].value)) {
              candidateCount++;
              break;
            }
          }
        }
      }
      console.log(
        `[DIM Aegis Overlay LGG DEBUG] DOM scan: ${allElements.length} elements, ${candidateCount} with 18-20 digit IDs, 0 grades resolved.`
      );
    }
  } catch (e) {
    console.debug("[DIM Aegis Overlay LGG] DOM scraping failed:", e);
  }
}
setTimeout(() => {
  if (!completionSignaled) {
    console.log("[DIM Aegis Overlay LGG] Timeout reached — signaling completion with whatever was found.");
    signalCompletion();
  }
}, 3e4);
setInterval(runDomScrape, 2e3);
setTimeout(runDomScrape, 1500);
console.log("[DIM Aegis Overlay] Light.gg Roll Appraiser content script initialized (API intercept + DOM scrape).");
