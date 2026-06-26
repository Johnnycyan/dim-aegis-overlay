const globalRegistry = {};
const instanceCache = {};
async function getPerkFromDB(hash) {
  try {
    const dbs = await indexedDB.databases();
    for (const dbInfo of dbs) {
      if (!dbInfo.name) continue;
      if (dbInfo.name.includes("google") || dbInfo.name.includes("chrome")) continue;
      const db = await new Promise((resolve) => {
        const req = indexedDB.open(dbInfo.name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (!db) continue;
      for (const storeName of Array.from(db.objectStoreNames)) {
        try {
          const val = await new Promise((resolve) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req1 = store.get(hash);
            req1.onsuccess = () => {
              if (req1.result) resolve(req1.result);
              else {
                const req2 = store.get(String(hash));
                req2.onsuccess = () => resolve(req2.result);
                req2.onerror = () => resolve(null);
              }
            };
            req1.onerror = () => resolve(null);
          });
          if (val) {
            if (val.displayProperties && val.displayProperties.name) {
              db.close();
              return {
                name: val.displayProperties.name,
                icon: val.displayProperties.icon || ""
              };
            }
            if (typeof val === "object") {
              const inner = val[hash] || val[String(hash)];
              if (inner && inner.displayProperties && inner.displayProperties.name) {
                db.close();
                return {
                  name: inner.displayProperties.name,
                  icon: inner.displayProperties.icon || ""
                };
              }
            }
          }
        } catch (e) {
        }
      }
      db.close();
    }
  } catch (err) {
    console.debug("Aegis Overlay: IndexedDB search failed", err);
  }
  return null;
}
function setupRegistryObserver(registryEl) {
  const regObserver = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "data-request-hashes") {
        const hashesStr = registryEl.getAttribute("data-request-hashes");
        if (hashesStr) {
          registryEl.removeAttribute("data-request-hashes");
          const hashes = hashesStr.split(",").map((h) => parseInt(h.trim(), 10)).filter((h) => !isNaN(h));
          let updated = false;
          for (const hash of hashes) {
            if (!globalRegistry[hash] || globalRegistry[hash].name.includes("Perk #")) {
              const info = await getPerkFromDB(hash);
              if (info) {
                globalRegistry[hash] = info;
                updated = true;
              }
            }
          }
          if (updated) {
            registryEl.setAttribute("data-registry", JSON.stringify(globalRegistry));
          }
        }
      }
    }
  });
  regObserver.observe(registryEl, {
    attributes: true,
    attributeFilter: ["data-request-hashes"]
  });
}
function registerPerks(perksMap) {
  let updated = false;
  for (const [hashStr, info] of Object.entries(perksMap)) {
    const hash = Number(hashStr);
    if (!globalRegistry[hash] && info.name && !info.name.includes("Unknown")) {
      globalRegistry[hash] = info;
      updated = true;
    }
  }
  let registryEl = document.getElementById("aegis-global-perk-registry");
  if (!registryEl) {
    registryEl = document.createElement("div");
    registryEl.id = "aegis-global-perk-registry";
    registryEl.style.display = "none";
    document.body.appendChild(registryEl);
    setupRegistryObserver(registryEl);
    updated = true;
  }
  if (updated) {
    registryEl.setAttribute("data-registry", JSON.stringify(globalRegistry));
  }
}
function findReactFiber(el) {
  const key = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
  );
  return key ? el[key] : null;
}
function findItemInFiber(fiber) {
  let curr = fiber;
  while (curr) {
    if (curr.memoizedProps) {
      if (curr.memoizedProps.item && typeof curr.memoizedProps.item === "object" && "hash" in curr.memoizedProps.item) {
        return curr.memoizedProps.item;
      }
      if (curr.memoizedProps.children && curr.memoizedProps.children.props && curr.memoizedProps.children.props.item) {
        return curr.memoizedProps.children.props.item;
      }
    }
    if (curr.pendingProps) {
      if (curr.pendingProps.item && typeof curr.pendingProps.item === "object" && "hash" in curr.pendingProps.item) {
        return curr.pendingProps.item;
      }
    }
    if (curr.stateNode && curr.stateNode.props) {
      if (curr.stateNode.props.item && typeof curr.stateNode.props.item === "object" && "hash" in curr.stateNode.props.item) {
        return curr.stateNode.props.item;
      }
    }
    curr = curr.return;
  }
  return null;
}
function processElement(el) {
  var _a, _b, _c, _d, _e, _f;
  try {
    const fiber = findReactFiber(el);
    if (!fiber) return;
    const item = findItemInFiber(fiber);
    if (!item || !item.hash) return;
    const isWeapon = item.weapon === true || ((_a = item.bucket) == null ? void 0 : _a.inWeapons) === true || item.sockets && ((_b = item.typeName) == null ? void 0 : _b.toLowerCase().includes("weapon"));
    if (!isWeapon) return;
    let perkHashes = [];
    let activePerkHashes = [];
    let perksDataMap = {};
    if (item.sockets && item.sockets.allSockets) {
      for (const socket of item.sockets.allSockets) {
        if (socket) {
          if (socket.plugged && socket.plugged.plugDef) {
            const def = socket.plugged.plugDef;
            if (def.hash) {
              perkHashes.push(def.hash);
              activePerkHashes.push(def.hash);
              perksDataMap[def.hash] = {
                name: ((_c = def.displayProperties) == null ? void 0 : _c.name) || "Unknown Perk",
                icon: ((_d = def.displayProperties) == null ? void 0 : _d.icon) || ""
              };
            }
          }
          if (socket.plugOptions) {
            for (const opt of socket.plugOptions) {
              if (opt.plugDef && opt.plugDef.hash) {
                const def = opt.plugDef;
                if (!perkHashes.includes(def.hash)) {
                  perkHashes.push(def.hash);
                }
                perksDataMap[def.hash] = {
                  name: ((_e = def.displayProperties) == null ? void 0 : _e.name) || "Unknown Perk",
                  icon: ((_f = def.displayProperties) == null ? void 0 : _f.icon) || ""
                };
              }
            }
          }
        }
      }
    }
    const instanceId = item.id;
    if (instanceId) {
      if (perkHashes.length > 3) {
        instanceCache[instanceId] = {
          perkHashes: [...perkHashes],
          perksDataMap: { ...perksDataMap }
        };
      } else if (instanceCache[instanceId]) {
        const cached = instanceCache[instanceId];
        for (const hash of cached.perkHashes) {
          if (!perkHashes.includes(hash)) {
            perkHashes.push(hash);
          }
        }
        Object.assign(perksDataMap, cached.perksDataMap);
      }
    }
    registerPerks(perksDataMap);
    const newHash = String(item.hash);
    const newPerks = perkHashes.join(",");
    const existingHash = el.getAttribute("data-aegis-item-hash");
    const existingPerks = el.getAttribute("data-aegis-perk-hashes");
    if (existingHash === newHash && existingPerks === newPerks) {
      return;
    }
    el.setAttribute("data-aegis-item-hash", newHash);
    el.setAttribute("data-aegis-item-name", item.name || "Unknown Weapon");
    el.setAttribute("data-aegis-perk-hashes", newPerks);
    el.setAttribute("data-aegis-perks-data", JSON.stringify(perksDataMap));
    el.setAttribute("data-aegis-active-perk-hashes", activePerkHashes.join(","));
    if (instanceId) {
      el.setAttribute("data-aegis-instance-id", String(instanceId));
    }
  } catch (e) {
    console.debug("Aegis Overlay: Element scan failed", e);
  }
}
const SELECTORS = [
  'div[id^="item-"]',
  'div[class*="item-"]',
  'div[class*="StoreItem"]',
  'div[class*="InventoryItem"]',
  ".item",
  ".item-tile",
  '[class*="ItemPopup"]',
  '[class*="item-popup"]',
  '[class*="Sheet"]',
  '[class*="sheet"]',
  ".item-popup"
].join(",");
function scanPage() {
  const candidates = document.querySelectorAll(SELECTORS);
  for (let i = 0; i < candidates.length; i++) {
    processElement(candidates[i]);
  }
}
setInterval(scanPage, 1e3);
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
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    return;
  }
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
startObserver();
console.log("DIM Aegis Overlay: React Fiber scanner initialized in MAIN world.");
scanPage();
