/**
 * DIM Aegis Overlay - Light.gg Content Script (ISOLATED world)
 *
 * Runs on light.gg Roll Appraiser page. Uses a two-pronged strategy:
 *
 * 1. API INTERCEPT (primary): Listens for grades dispatched by the MAIN world
 *    interceptor (lightgg-main-world.ts) which wraps window.fetch to capture
 *    Light.gg's internal API responses.
 *
 * 2. DOM SCRAPING (fallback): Periodically scans the rendered weapon cards
 *    for instance IDs and letter grades, as a resilient fallback if the API
 *    schema changes.
 *
 * Once grades are collected (by either method), they are merged into
 * chrome.storage.local. When triggered by a background-opened tab, a
 * completion signal (__aegis_lgg_done__) is dispatched so the background
 * script can close the tab.
 */

let totalGradesFound = 0;
let completionSignaled = false;
let apiGradesReceived = false;
let completionTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Merges a grades map into chrome.storage.local and updates the count.
 */
function saveGrades(grades: Record<string, string>, source: string) {
  const count = Object.keys(grades).length;
  if (count === 0) return;

  chrome.storage.local.get('lightggData', (res) => {
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
      totalGradesFound = total;
    });
  });
}

/**
 * Signals to the background script that grade collection is complete
 * so it can close the hidden tab (if one was opened for background sync).
 */
function signalCompletion() {
  if (completionSignaled) return;
  completionSignaled = true;
  console.log('[DIM Aegis Overlay LGG] Signaling completion to background script.');
  chrome.storage.local.set({ lightggSyncStatus: 'done', lightggLastSync: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy 1: Listen for grades from the MAIN world API interceptor
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('__aegis_lgg_grades__', (e: Event) => {
  const { grades, source } = (e as CustomEvent).detail as { grades: Record<string, string>; source: string };
  if (grades && Object.keys(grades).length > 0) {
    apiGradesReceived = true;
    saveGrades(grades, `api-intercept:${source}`);

    // Cancel any pending DOM-scrape completion timer and wait a bit
    // more to catch additional API calls (pagination, etc.)
    if (completionTimer) clearTimeout(completionTimer);
    completionTimer = setTimeout(() => {
      signalCompletion();
    }, 4000); // wait 4s after last API response before declaring done
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Strategy 2: DOM Scraping (fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans all elements on the page for Destiny instance IDs (18-20 digits) in any attribute,
 * traverses up to find the weapon container, and resolves the letter grade.
 */
function scrapeLightGGGrades(): Record<string, string> {
  const gradesMap: Record<string, string> = {};
  const allElements = document.getElementsByTagName('*');

  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i] as HTMLElement;
    let instanceId = '';

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

    let grade = '';
    let current: HTMLElement | null = el;

    for (let depth = 0; depth < 5; depth++) {
      if (!current) break;

      // Method 1: Check quality image title/src
      const qualityImg = current.querySelector('img.quality') as HTMLImageElement | null;
      if (qualityImg) {
        const title = qualityImg.getAttribute('title');
        if (title) {
          const titleMatch = title.match(/\(([SABCDF][+-]?)\)/i);
          if (titleMatch) grade = titleMatch[1].toUpperCase();
        }
        if (!grade) {
          const src = qualityImg.getAttribute('src');
          if (src) {
            const srcMatch = decodeURIComponent(src).match(/quality-(.+)-text\.svg/i);
            if (srcMatch) grade = srcMatch[1].toUpperCase();
          }
        }
      }

      // Method 2: Check tags element text content
      if (!grade) {
        const tagsEl = current.querySelector('.tags') as HTMLElement | null;
        if (tagsEl && tagsEl.textContent) {
          const parts = tagsEl.textContent.trim().split(/\s+/);
          const lastWord = parts[parts.length - 1];
          if (/^(S\+|[SABCDF][+-]?)$/i.test(lastWord)) {
            grade = lastWord.toUpperCase();
          }
        }
      }

      // Method 3: Fallback for God Rolls
      if (!grade) {
        const hasGodClass = current.querySelector('.god') !== null;
        const hasGodText = current.textContent && /God\s+Roll/i.test(current.textContent);
        if (hasGodClass || hasGodText) grade = 'S+';
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
  // If API interception already got results, DOM scraping is lower priority
  // but still runs as a supplement
  try {
    const grades = scrapeLightGGGrades();
    const count = Object.keys(grades).length;
    const now = Date.now();

    if (count > 0 && count !== lastDomCount) {
      lastDomCount = count;
      saveGrades(grades, 'dom-scrape');

      // If API didn't fire, use DOM results to trigger completion
      if (!apiGradesReceived) {
        if (completionTimer) clearTimeout(completionTimer);
        completionTimer = setTimeout(() => {
          signalCompletion();
        }, 5000);
      }
    } else if (count === 0 && now - lastDebugLog > 10000) {
      lastDebugLog = now;
      const allElements = document.getElementsByTagName('*');
      let candidateCount = 0;
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i] as HTMLElement;
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
    console.debug('[DIM Aegis Overlay LGG] DOM scraping failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback completion: if nothing is found in 30 seconds, signal done anyway
// ─────────────────────────────────────────────────────────────────────────────
setTimeout(() => {
  if (!completionSignaled) {
    console.log('[DIM Aegis Overlay LGG] Timeout reached — signaling completion with whatever was found.');
    signalCompletion();
  }
}, 30000);

// Run DOM scrape periodically
setInterval(runDomScrape, 2000);
setTimeout(runDomScrape, 1500);

console.log('[DIM Aegis Overlay] Light.gg Roll Appraiser content script initialized (API intercept + DOM scrape).');
