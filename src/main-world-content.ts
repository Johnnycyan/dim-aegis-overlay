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

interface PerkInfo {
  name: string;
  icon: string;
}

// Global registry of all seen perks, shared via a hidden DOM element
const globalRegistry: Record<number, PerkInfo> = {};

// Global cache for weapon instances to store full perk sets (e.g. from popups)
const instanceCache: Record<string, { perkHashes: number[]; perksDataMap: Record<number, PerkInfo> }> = {};

/**
 * Queries DIM's local IndexedDB databases for a perk definition by its hash.
 * Traverses all stores and handles both key-lookup and nested dictionary formats.
 */
async function getPerkFromDB(hash: number): Promise<PerkInfo | null> {
  try {
    const dbs = await indexedDB.databases();
    for (const dbInfo of dbs) {
      if (!dbInfo.name) continue;
      // Skip third-party/unrelated databases
      if (dbInfo.name.includes('google') || dbInfo.name.includes('chrome')) continue;

      const db = await new Promise<IDBDatabase | null>((resolve) => {
        const req = indexedDB.open(dbInfo.name!);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (!db) continue;

      for (const storeName of Array.from(db.objectStoreNames)) {
        try {
          const val = await new Promise<any>((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            
            // Try numeric key lookup
            const req1 = store.get(hash);
            req1.onsuccess = () => {
              if (req1.result) resolve(req1.result);
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
        } catch (e) {
          // Ignore store access errors
        }
      }
      db.close();
    }
  } catch (err) {
    console.debug('Aegis Overlay: IndexedDB search failed', err);
  }
  return null;
}

/**
 * Attaches a MutationObserver to the registry element to listen for on-demand perk name requests
 * from the isolated content script, resolving them via IndexedDB.
 */
function setupRegistryObserver(registryEl: HTMLElement) {
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
function registerPerks(perksMap: Record<number, PerkInfo>) {
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
function findReactFiber(el: HTMLElement): any {
  const key = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  );
  return key ? (el as any)[key] : null;
}

/**
 * Traverses up the React Fiber tree to locate the component containing the 'item' prop.
 */
function findItemInFiber(fiber: any): any {
  let curr = fiber;
  while (curr) {
    // Check memoizedProps
    if (curr.memoizedProps) {
      if (curr.memoizedProps.item && typeof curr.memoizedProps.item === 'object' && 'hash' in curr.memoizedProps.item) {
        return curr.memoizedProps.item;
      }
      // Check children props wrapper
      if (curr.memoizedProps.children && curr.memoizedProps.children.props && curr.memoizedProps.children.props.item) {
        return curr.memoizedProps.children.props.item;
      }
    }
    // Check pendingProps
    if (curr.pendingProps) {
      if (curr.pendingProps.item && typeof curr.pendingProps.item === 'object' && 'hash' in curr.pendingProps.item) {
        return curr.pendingProps.item;
      }
    }
    // Check stateNode (component instance)
    if (curr.stateNode && curr.stateNode.props) {
      if (curr.stateNode.props.item && typeof curr.stateNode.props.item === 'object' && 'hash' in curr.stateNode.props.item) {
        return curr.stateNode.props.item;
      }
    }
    curr = curr.return; // Move up the React tree
  }
  return null;
}

/**
 * Scans a DOM element for item properties in its React Fiber and writes them to attributes.
 */
function processElement(el: HTMLElement) {
  try {
    const fiber = findReactFiber(el);
    if (!fiber) return;

    const item = findItemInFiber(fiber);
    if (!item || !item.hash) return;

    // Check if this item is a weapon.
    const isWeapon =
      item.weapon === true ||
      item.bucket?.inWeapons === true ||
      (item.sockets && item.typeName?.toLowerCase().includes('weapon'));

    if (!isWeapon) return;

    let perkHashes: number[] = [];
    let activePerkHashes: number[] = []; // Only currently plugged perks
    let perksDataMap: Record<number, PerkInfo> = {};

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
      } else if (instanceCache[instanceId]) {
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
  } catch (e) {
    console.debug('Aegis Overlay: Element scan failed', e);
  }
}


/**
 * Queries the document for potential item elements and processes them.
 */
function scanPage() {
  const selectors = [
    'div[id^="item-"]',
    'div[class*="item-"]',
    'div[class*="StoreItem"]',
    'div[class*="InventoryItem"]',
    '.item',
    '.item-tile',
  ];
  const candidates = document.querySelectorAll<HTMLElement>(selectors.join(','));
  for (let i = 0; i < candidates.length; i++) {
    processElement(candidates[i]);
  }
}

// 1. Periodic scanning to catch any missed updates
setInterval(scanPage, 1000);

// 2. Immediate scan on DOM modifications using MutationObserver
const observer = new MutationObserver((mutations) => {
  let shouldScan = false;
  for (let i = 0; i < mutations.length; i++) {
    if (mutations[i].addedNodes.length > 0) {
      shouldScan = true;
      break;
    }
  }
  if (shouldScan) {
    scanPage();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Run initial scan once script loads
console.log('DIM Aegis Overlay: React Fiber scanner initialized in MAIN world.');
scanPage();
