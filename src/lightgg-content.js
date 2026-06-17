"use strict";
/**
 * DIM Aegis Overlay - Light.gg Content Script
 *
 * This script runs in the ISOLATED world of Light.gg's Roll Appraiser page.
 * It periodically scrapes the weapon card elements to extract weapon instance IDs
 * and their appraised grades, saving them to storage.
 */
/**
 * Scans all elements on the page for Destiny instance IDs (18-20 digits) in any attribute,
 * traverses up to find the weapon container, and resolves the letter grade.
 */
function scrapeLightGGGrades() {
    const gradesMap = {};
    const allElements = document.getElementsByTagName('*');
    for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        let instanceId = '';
        // Check all attributes of the element for an 18-20 digit numerical value (Bungie Instance ID)
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
        if (!instanceId)
            continue;
        // Go up the parent chain (up to 4 levels) to find the item card container,
        // and scan its subtree for the grade.
        let grade = '';
        let current = el;
        for (let depth = 0; depth < 5; depth++) {
            if (!current)
                break;
            // Method 1: Check quality image title/src
            const qualityImg = current.querySelector('img.quality');
            if (qualityImg) {
                const title = qualityImg.getAttribute('title');
                if (title) {
                    const titleMatch = title.match(/\(([SABCDF][+-]?)\)/i);
                    if (titleMatch) {
                        grade = titleMatch[1].toUpperCase();
                    }
                }
                if (!grade) {
                    const src = qualityImg.getAttribute('src');
                    if (src) {
                        const srcMatch = decodeURIComponent(src).match(/quality-(.+)-text\.svg/i);
                        if (srcMatch) {
                            grade = srcMatch[1].toUpperCase();
                        }
                    }
                }
            }
            // Method 2: Check tags element text content
            if (!grade) {
                const tagsEl = current.querySelector('.tags');
                if (tagsEl && tagsEl.textContent) {
                    const parts = tagsEl.textContent.trim().split(/\s+/);
                    const lastWord = parts[parts.length - 1];
                    if (/^(S\+|[SABCDF][+-]?)$/i.test(lastWord)) {
                        grade = lastWord.toUpperCase();
                    }
                }
            }
            // Method 3: Fallback for God Rolls (.god class or text "God Roll")
            if (!grade) {
                const hasGodClass = current.querySelector('.god') !== null;
                const hasGodText = current.textContent && /God\s+Roll/i.test(current.textContent);
                if (hasGodClass || hasGodText) {
                    grade = 'S+';
                }
            }
            if (grade) {
                break;
            }
            current = current.parentElement;
        }
        if (grade) {
            gradesMap[instanceId] = grade;
        }
    }
    return gradesMap;
}
let lastCount = 0;
let lastDebugLog = 0;
/**
 * Runs the scraper, merges results, and writes to chrome.storage.local.
 */
function runScrape() {
    try {
        const grades = scrapeLightGGGrades();
        const count = Object.keys(grades).length;
        const now = Date.now();
        // Only write if we found grades and the count has changed
        if (count > 0 && count !== lastCount) {
            lastCount = count;
            chrome.storage.local.get('lightggData', (res) => {
                const existing = res.lightggData || {};
                const merged = { ...existing, ...grades };
                chrome.storage.local.set({ lightggData: merged }, () => {
                    console.log(`[DIM Aegis Overlay] Synced ${Object.keys(merged).length} weapon grades in local cache.`);
                });
            });
        }
        else if (count === 0 && now - lastDebugLog > 10000) {
            // Diagnostic check every 10 seconds if 0 grades were found
            lastDebugLog = now;
            const allElements = document.getElementsByTagName('*');
            let candidateCount = 0;
            const sampleElements = [];
            for (let i = 0; i < allElements.length; i++) {
                const el = allElements[i];
                if (el.attributes) {
                    for (let a = 0; a < el.attributes.length; a++) {
                        if (el.attributes[a].value && /\d{18,20}/.test(el.attributes[a].value)) {
                            candidateCount++;
                            if (sampleElements.length < 2) {
                                sampleElements.push(el);
                            }
                            break;
                        }
                    }
                }
            }
            console.log(`[DIM Aegis Overlay DEBUG] No grades resolved yet. DOM elements: ${allElements.length}, Elements containing 18-20 digit values: ${candidateCount}`);
            // 1. Log unique class names on the page that mention "grade", "rank", "stamp", or "popularity"
            const interestingClasses = new Set();
            for (let i = 0; i < allElements.length; i++) {
                const classes = allElements[i].className;
                if (classes && typeof classes === 'string') {
                    classes.split(/\s+/).forEach(c => {
                        if (/grade|rank|stamp|popularity/i.test(c)) {
                            interestingClasses.add(c);
                        }
                    });
                }
            }
            console.log(`[DIM Aegis Overlay DEBUG] Interesting class names found on page:`, Array.from(interestingClasses));
            // 2. Dump all descendant tags/classes/texts of only the FIRST sample card
            if (sampleElements.length > 0) {
                const el = sampleElements[0];
                console.log(`--- SAMPLE ELEMENT #1 --- Tag: ${el.tagName}, Class: ${el.className}, ID: ${el.id}`);
                const descendants = el.querySelectorAll('*');
                console.log(`  Descendants count: ${descendants.length}`);
                let logLinesCount = 0;
                for (let d = 0; d < descendants.length; d++) {
                    const desc = descendants[d];
                    const txt = desc.textContent?.trim() || "";
                    // Only log elements that have a class name OR text content to keep it clean and token-friendly
                    if ((desc.className || txt) && logLinesCount < 40) {
                        logLinesCount++;
                        console.log(`    #${d}: <${desc.tagName} class="${desc.className}"> Text: "${txt.substring(0, 40)}"` +
                            (desc.attributes.length ? ` Attributes: ${Array.from(desc.attributes).map(a => `${a.name}=${a.value}`).join(', ')}` : ''));
                    }
                }
                if (descendants.length > logLinesCount) {
                    console.log(`    ... and ${descendants.length - logLinesCount} more descendants`);
                }
            }
        }
    }
    catch (e) {
        console.debug('[DIM Aegis Overlay] Scraping check failed:', e);
    }
}
// Check periodically (every 2 seconds) to handle asynchronous rendering on Light.gg
setInterval(runScrape, 2000);
setTimeout(runScrape, 1000);
console.log('[DIM Aegis Overlay] Light.gg Roll Appraiser scraper initialized.');
