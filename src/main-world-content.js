"use strict";
/**
 * DIM Aegis Overlay - MAIN World Content Script
 *
 * This script runs in the MAIN world context of the Destiny Item Manager page.
 * It has direct access to the page's DOM elements and React Fiber properties.
 *
 * It periodically scans the DOM for item tile elements, extracts the Bungie weapon
 * hash and socketed perk hashes/names from the React Fiber, and serializes them
 * into custom DOM data-attributes (`data-aegis-*`).
 *
 * This allows the ISOLATED world content script to read the data securely and perform
 * wishlist calculations and UI injections without needing direct React Fiber access.
 */
// Global registry of all seen perks, shared via a hidden DOM element
const globalRegistry = {};
// Global cache for weapon instances to store full perk sets (e.g. from popups)
const instanceCache = {};
/**
 * Queries DIM's local IndexedDB databases for a perk definition by its hash.
 * Traverses all stores and handles both key-lookup and nested dictionary formats.
 */
async function getPerkFromDB(hash) {
    try {
        const dbs = await indexedDB.databases();
        for (const dbInfo of dbs) {
            if (!dbInfo.name)
                continue;
            // Skip third-party/unrelated databases
            if (dbInfo.name.includes('google') || dbInfo.name.includes('chrome'))
                continue;
            const db = await new Promise((resolve) => {
                const req = indexedDB.open(dbInfo.name);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            });
            if (!db)
                continue;
            for (const storeName of Array.from(db.objectStoreNames)) {
                try {
                    const val = await new Promise((resolve) => {
                        const tx = db.transaction(storeName, 'readonly');
                        const store = tx.objectStore(storeName);
                        // Try numeric key lookup
                        const req1 = store.get(hash);
                        req1.onsuccess = () => {
                            if (req1.result)
                                resolve(req1.result);
                            else {
                                // Try string key lookup
                                const req2 = store.get(String(hash));
                                req2.onsuccess = () => resolve(req2.result);
                                req2.onerror = () => resolve(null);
                            }
                        };
                        req1.onerror = () => resolve(null);
                    });
                    if (val) {
                        // Case A: The store yields a direct definition object
                        if (val.displayProperties && val.displayProperties.name) {
                            db.close();
                            return {
                                name: val.displayProperties.name,
                                icon: val.displayProperties.icon || '',
                            };
                        }
                        // Case B: The store holds a single large manifest object mapping hashes to definitions
                        if (typeof val === 'object') {
                            const inner = val[hash] || val[String(hash)];
                            if (inner && inner.displayProperties && inner.displayProperties.name) {
                                db.close();
                                return {
                                    name: inner.displayProperties.name,
                                    icon: inner.displayProperties.icon || '',
                                };
                            }
                        }
                    }
                }
                catch (e) {
                    // Ignore store access errors
                }
            }
            db.close();
        }
    }
    catch (err) {
        console.debug('Aegis Overlay: IndexedDB search failed', err);
    }
    return null;
}
/**
 * Attaches a MutationObserver to the registry element to listen for on-demand perk name requests
 * from the isolated content script, resolving them via IndexedDB.
 */
function setupRegistryObserver(registryEl) {
    const regObserver = new MutationObserver(async (mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-request-hashes') {
                const hashesStr = registryEl.getAttribute('data-request-hashes');
                if (hashesStr) {
                    // Clear request attribute to avoid loop triggers
                    registryEl.removeAttribute('data-request-hashes');
                    const hashes = hashesStr
                        .split(',')
                        .map((h) => parseInt(h.trim(), 10))
                        .filter((h) => !isNaN(h));
                    let updated = false;
                    for (const hash of hashes) {
                        // Only search if the name is not yet resolved
                        if (!globalRegistry[hash] || globalRegistry[hash].name.includes('Perk #')) {
                            const info = await getPerkFromDB(hash);
                            if (info) {
                                globalRegistry[hash] = info;
                                updated = true;
                            }
                        }
                    }
                    if (updated) {
                        registryEl.setAttribute('data-registry', JSON.stringify(globalRegistry));
                    }
                }
            }
        }
    });
    regObserver.observe(registryEl, {
        attributes: true,
        attributeFilter: ['data-request-hashes'],
    });
}
/**
 * Updates the global perk registry DOM element with newly seen perks.
 */
function registerPerks(perksMap) {
    let updated = false;
    for (const [hashStr, info] of Object.entries(perksMap)) {
        const hash = Number(hashStr);
        if (!globalRegistry[hash] && info.name && !info.name.includes('Unknown')) {
            globalRegistry[hash] = info;
            updated = true;
        }
    }
    let registryEl = document.getElementById('aegis-global-perk-registry');
    if (!registryEl) {
        registryEl = document.createElement('div');
        registryEl.id = 'aegis-global-perk-registry';
        registryEl.style.display = 'none';
        document.body.appendChild(registryEl);
        setupRegistryObserver(registryEl);
        updated = true; // Force initial sync
    }
    if (updated) {
        registryEl.setAttribute('data-registry', JSON.stringify(globalRegistry));
    }
}
/**
 * Finds the React Fiber node associated with a DOM element.
 */
function findReactFiber(el) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    return key ? el[key] : null;
}
/**
 * Extracts the item object from a fiber node's props.
 * Returns the item if it has a `hash` property, otherwise null.
 */
function extractItemFromFiberProps(props) {
    if (!props)
        return null;
    // Direct item prop
    if (props.item && typeof props.item === 'object' && 'hash' in props.item) {
        return props.item;
    }
    // dimItem prop (alternate naming used in some DIM components)
    if (props.dimItem && typeof props.dimItem === 'object' && 'hash' in props.dimItem) {
        return props.dimItem;
    }
    // Children wrapper pattern
    if (props.children && props.children.props) {
        const childProps = props.children.props;
        if (childProps.item && typeof childProps.item === 'object' && 'hash' in childProps.item) {
            return childProps.item;
        }
        if (childProps.dimItem && typeof childProps.dimItem === 'object' && 'hash' in childProps.dimItem) {
            return childProps.dimItem;
        }
    }
    return null;
}
/**
 * Traverses the React Fiber tree (up AND down) to locate the component containing the 'item' prop.
 */
function findItemInFiber(fiber) {
    // --- Phase 1: Search UPWARD via curr.return ---
    let curr = fiber;
    let depth = 0;
    while (curr && depth < 40) {
        const item = extractItemFromFiberProps(curr.memoizedProps) ||
            extractItemFromFiberProps(curr.pendingProps) ||
            extractItemFromFiberProps(curr.stateNode?.props);
        if (item)
            return item;
        curr = curr.return;
        depth++;
    }
    // --- Phase 2: Search DOWNWARD via child/sibling traversal (BFS) ---
    // Sometimes the fiber is a wrapper and the item prop is on a child component
    const queue = [fiber];
    const visited = new Set();
    let bfsDepth = 0;
    while (queue.length > 0 && bfsDepth < 80) {
        const node = queue.shift();
        if (!node || visited.has(node))
            continue;
        visited.add(node);
        const item = extractItemFromFiberProps(node.memoizedProps) ||
            extractItemFromFiberProps(node.pendingProps) ||
            extractItemFromFiberProps(node.stateNode?.props);
        if (item)
            return item;
        if (node.child)
            queue.push(node.child);
        if (node.sibling)
            queue.push(node.sibling);
        bfsDepth++;
    }
    return null;
}
/**
 * Scans a DOM element for item properties in its React Fiber and writes them to attributes.
 */
function processElement(el) {
    try {
        // Skip if any ancestor element is already annotated for an item.
        // This prevents double-annotating nested elements (e.g. a container div
        // AND its inner item tile both matching our selectors), which causes
        // content.ts to call removeBadge() on the inner element and delete
        // the badge that was just injected by the outer element's processing.
        if (el.parentElement?.closest('[data-aegis-item-hash]')) {
            return;
        }
        const fiber = findReactFiber(el);
        if (!fiber)
            return;
        const item = findItemInFiber(fiber);
        if (!item || !item.hash)
            return;
        // Check if this item is a weapon or armor.
        const isWeapon = item.weapon === true ||
            item.bucket?.inWeapons === true ||
            item.itemCategoryHashes?.includes(1) ||
            (item.sockets && item.typeName?.toLowerCase().includes('weapon'));
        const isArmor = item.bucket?.inArmor === true ||
            (item.bucket && item.bucket.sort === 'Armor') ||
            item.itemCategoryHashes?.includes(20) ||
            ['helmet', 'gauntlets', 'chest armor', 'leg armor', 'class item'].some((t) => item.typeName?.toLowerCase().includes(t));
        if (!isWeapon && !isArmor)
            return;
        if (isArmor) {
            const newHash = String(item.hash);
            const existingHash = el.getAttribute('data-aegis-item-hash');
            if (existingHash === newHash) {
                return;
            }
            el.setAttribute('data-aegis-item-hash', newHash);
            el.setAttribute('data-aegis-item-name', item.name || 'Unknown Armor');
            el.setAttribute('data-aegis-item-type', 'armor');
            const instanceId = item.id;
            if (instanceId) {
                el.setAttribute('data-aegis-instance-id', String(instanceId));
            }
            // Clear weapon-specific attributes
            el.removeAttribute('data-aegis-perk-hashes');
            el.removeAttribute('data-aegis-perks-data');
            el.removeAttribute('data-aegis-active-perk-hashes');
            return;
        }
        let perkHashes = [];
        let activePerkHashes = []; // Only currently plugged perks
        let perksDataMap = {};
        // Read sockets to extract active and optional perks
        if (item.sockets && item.sockets.allSockets) {
            for (const socket of item.sockets.allSockets) {
                if (socket) {
                    // 1. Current plugged perk
                    if (socket.plugged && socket.plugged.plugDef) {
                        const def = socket.plugged.plugDef;
                        if (def.hash) {
                            perkHashes.push(def.hash);
                            activePerkHashes.push(def.hash);
                            perksDataMap[def.hash] = {
                                name: def.displayProperties?.name || 'Unknown Perk',
                                icon: def.displayProperties?.icon || '',
                            };
                        }
                    }
                    // 2. Selectable alternative perks in the column
                    if (socket.plugOptions) {
                        for (const opt of socket.plugOptions) {
                            if (opt.plugDef && opt.plugDef.hash) {
                                const def = opt.plugDef;
                                if (!perkHashes.includes(def.hash)) {
                                    perkHashes.push(def.hash);
                                }
                                perksDataMap[def.hash] = {
                                    name: def.displayProperties?.name || 'Unknown Perk',
                                    icon: def.displayProperties?.icon || '',
                                };
                            }
                        }
                    }
                }
            }
        }
        // Instance ID cache logic (handles async loading and popup-to-grid sync)
        const instanceId = item.id;
        if (instanceId) {
            // If we scanned a complete perk list (>3 perks indicates full perks loaded)
            if (perkHashes.length > 3) {
                instanceCache[instanceId] = {
                    perkHashes: [...perkHashes],
                    perksDataMap: { ...perksDataMap },
                };
            }
            else if (instanceCache[instanceId]) {
                // If current element lacks perks but we have it in cache, populate it!
                const cached = instanceCache[instanceId];
                for (const hash of cached.perkHashes) {
                    if (!perkHashes.includes(hash)) {
                        perkHashes.push(hash);
                    }
                    // Only add to active list if it was plugged (present in activePerkHashes already)
                }
                Object.assign(perksDataMap, cached.perksDataMap);
            }
        }
        // Register all parsed perks in the global dictionary
        registerPerks(perksDataMap);
        const newHash = String(item.hash);
        const newPerks = perkHashes.join(',');
        const existingHash = el.getAttribute('data-aegis-item-hash');
        const existingPerks = el.getAttribute('data-aegis-perk-hashes');
        // Optimization: Avoid updating the DOM if the values are identical
        if (existingHash === newHash && existingPerks === newPerks) {
            return;
        }
        // Set attributes for the isolated world content script to read
        el.setAttribute('data-aegis-item-hash', newHash);
        el.setAttribute('data-aegis-item-name', item.name || 'Unknown Weapon');
        el.setAttribute('data-aegis-perk-hashes', newPerks);
        el.setAttribute('data-aegis-perks-data', JSON.stringify(perksDataMap));
        el.setAttribute('data-aegis-active-perk-hashes', activePerkHashes.join(','));
        if (instanceId) {
            el.setAttribute('data-aegis-instance-id', String(instanceId));
        }
    }
    catch (e) {
        console.debug('Aegis Overlay: Element scan failed', e);
    }
}
const SELECTORS = [
    '[id^="item-"]',
    '[class*="item-"]',
    '[class*="StoreItem"]',
    '[class*="InventoryItem"]',
    '[class*="item-tile"]',
    '.item',
    '.item-tile',
    '[class*="ItemPopup"]',
    '[class*="item-popup"]',
    '[class*="Sheet"]',
    '[class*="sheet"]',
    '.item-popup',
].join(',');
/**
 * Queries the document for potential item elements and processes them.
 */
function scanPage() {
    const candidates = document.querySelectorAll(SELECTORS);
    for (let i = 0; i < candidates.length; i++) {
        processElement(candidates[i]);
    }
}
// 1. Periodic scanning to catch any missed updates
setInterval(scanPage, 1000);
// 2. Immediate scan on DOM modifications using MutationObserver
const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        if (mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) {
                    if (node.matches && node.matches(SELECTORS)) {
                        processElement(node);
                    }
                    const children = node.querySelectorAll(SELECTORS);
                    children.forEach(processElement);
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
    });
    scanPage();
}
startObserver();
console.log('DIM Aegis Overlay: React Fiber scanner initialized in MAIN world.');
