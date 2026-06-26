function parseWishlist(rawText) {
  const database = {};
  const lines = rawText.split(/\r?\n/);
  let currentNotes = "";
  let currentWeaponName = "";
  for (let line of lines) {
    line = line.trim();
    if (line.startsWith("//")) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.startsWith("//notes:") || lowerLine.startsWith("// notes:")) {
        const colonIndex = line.indexOf(":");
        currentNotes = line.substring(colonIndex + 1).trim();
      } else {
        const cleanComment = line.replace(/^\/\/+/g, "").trim();
        const lowerComment = cleanComment.toLowerCase();
        if (cleanComment && !lowerComment.startsWith("notes:") && !lowerComment.startsWith("title:") && !lowerComment.startsWith("description:")) {
          currentWeaponName = cleanComment;
        }
        currentNotes = "";
      }
      continue;
    }
    if (!line) {
      continue;
    }
    if (!line.includes("dimwishlist:")) {
      continue;
    }
    try {
      const hashIndex = line.indexOf("#");
      let queryPart = line;
      let notes = currentNotes;
      if (hashIndex !== -1) {
        queryPart = line.substring(0, hashIndex).trim();
        const rawNotes = line.substring(hashIndex + 1).trim();
        if (rawNotes.toLowerCase().startsWith("notes:")) {
          notes = rawNotes.substring(6).trim();
        } else {
          notes = rawNotes;
        }
      }
      const itemMatch = queryPart.match(/item=(-?\d+)/);
      if (!itemMatch) {
        continue;
      }
      const itemHash = parseInt(itemMatch[1], 10);
      const perksMatch = queryPart.match(/perks=([\d,]+)/);
      if (!perksMatch) {
        continue;
      }
      const perks = perksMatch[1].split(",").map((p) => parseInt(p.trim(), 10)).filter((p) => !isNaN(p));
      if (perks.length === 0) {
        continue;
      }
      const roll = {
        itemHash,
        perks,
        notes,
        title: currentWeaponName || void 0
      };
      if (!database[itemHash]) {
        database[itemHash] = [];
      }
      database[itemHash].push(roll);
    } catch (e) {
      console.error("Failed to parse wishlist line:", line, e);
    }
  }
  return database;
}
const DEFAULT_URL = "https://raw.githubusercontent.com/charlesxcaliber/DIMAegisWeaponWishlist/main/MrCharlesWishlist_MRB_PPC2.txt";
const SYNC_ALARM_NAME = "sync-wishlist-alarm";
const LGG_ROLL_APPRAISER_URL = "https://www.light.gg/god-roll/roll-appraiser/";
async function fetchAndCacheWishlist(url) {
  let targetUrl = url || "";
  if (!targetUrl) {
    const storage = await chrome.storage.local.get("wishlistUrl");
    targetUrl = storage.wishlistUrl || DEFAULT_URL;
  }
  await chrome.storage.local.set({
    syncStatus: "loading",
    syncError: null,
    wishlistUrl: targetUrl
  });
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }
    const text = await response.text();
    const parsedDb = parseWishlist(text);
    const parsedCount = Object.keys(parsedDb).length;
    let enhancedToNormal = {};
    try {
      const mapResponse = await fetch(
        "https://raw.githubusercontent.com/DestinyItemManager/d2-additional-info/master/output/trait-to-enhanced-trait.json"
      );
      if (mapResponse.ok) {
        const normalToEnhanced = await mapResponse.json();
        for (const [normalStr, enhanced] of Object.entries(normalToEnhanced)) {
          const normal = parseInt(normalStr, 10);
          if (!isNaN(normal) && enhanced) {
            enhancedToNormal[enhanced] = normal;
          }
        }
      }
    } catch (mapErr) {
      console.error("Failed to fetch enhanced perk mapping:", mapErr);
    }
    await chrome.storage.local.set({
      wishlistData: parsedDb,
      lastUpdated: Date.now(),
      syncStatus: "success",
      syncError: null,
      parsedCount,
      enhancedToNormal
    });
    console.log(`Wishlist sync complete. Parsed ${parsedCount} items from: ${targetUrl}`);
    return { success: true, count: parsedCount };
  } catch (err) {
    const errMsg = err.message || String(err);
    console.error("Wishlist sync failed:", errMsg);
    await chrome.storage.local.set({
      syncStatus: "error",
      syncError: errMsg
    });
    return { success: false, error: errMsg };
  }
}
const SHEET_ID = "1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY";
const ALL_TABS = [
  "Autos",
  "Bows",
  "HCs",
  "Pulses",
  "Scouts",
  "Sidearms",
  "SMGs",
  "BGLs",
  "Fusions",
  "Glaives",
  "Shotguns",
  "Snipers",
  "Rocket Sidearms",
  "Traces",
  "HGLs",
  "LFRs",
  "LMGs",
  "Rockets",
  "Swords",
  "Other"
];
function parseCSV(text) {
  const normalizedText = text.replace(/\r\n|\r/g, "\n");
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < normalizedText.length; i++) {
    const c = normalizedText[i], nx = normalizedText[i + 1];
    if (inQ) {
      if (c === '"' && nx === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
  }
  if (row.length || field) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
function normName(s) {
  return (s ?? "").split("\n")[0].trim().toLowerCase();
}
function stripEdition(name) {
  return name.replace(/\s*\([^)]+\)\s*$/, "").trim();
}
async function fetchAndCacheAegisSheet() {
  console.log("DIM Aegis Overlay: Fetching Aegis Master Spreadsheet...");
  const weapons = {};
  const categories = {};
  try {
    const promises = ALL_TABS.map(async (tab) => {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch tab ${tab}: ${res.statusText}`);
      }
      const csvText = await res.text();
      const rows = parseCSV(csvText);
      if (rows.length < 2) return;
      const header = rows[0];
      const idx = {};
      header.forEach((col, i) => {
        idx[col.trim()] = i;
      });
      const getVal = (row, key) => {
        const i = idx[key];
        return i !== void 0 ? (row[i] ?? "").trim() : "";
      };
      const categoryWeapons = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const nameVal = getVal(row, "Name");
        if (!nameVal) continue;
        const weaponName = nameVal.split("\n")[0].trim();
        const normalized = normName(weaponName);
        const baseNormalized = normName(stripEdition(weaponName));
        const weaponData = {
          name: weaponName,
          energy: getVal(row, "Energy"),
          frame: getVal(row, "Frame"),
          barrel: getVal(row, "PERKS Barrel"),
          mag: getVal(row, "Mag"),
          perk1: getVal(row, "Perk 1"),
          perk2: getVal(row, "Perk 2"),
          origin: getVal(row, "Origin Trait"),
          notes: getVal(row, "ANALYSIS Notes"),
          rank: getVal(row, "Rank"),
          tier: getVal(row, "Tier")
        };
        weapons[normalized] = weaponData;
        if (baseNormalized !== normalized) {
          weapons[baseNormalized] = weaponData;
        }
        categoryWeapons.push(weaponData);
      }
      categoryWeapons.sort((a, b) => {
        const rA = parseInt(a.rank, 10);
        const rB = parseInt(b.rank, 10);
        return (isNaN(rA) ? 999 : rA) - (isNaN(rB) ? 999 : rB);
      });
      categories[tab] = categoryWeapons;
    });
    await Promise.all(promises);
    await chrome.storage.local.set({
      aegisSheetDb: { weapons, categories },
      aegisSheetLastSync: Date.now()
    });
    console.log("DIM Aegis Overlay: Aegis spreadsheet sync completed successfully.");
    return { success: true };
  } catch (err) {
    const errMsg = err.message || String(err);
    console.error("DIM Aegis Overlay: Failed to fetch/cache Aegis spreadsheet:", errMsg);
    return { success: false, error: errMsg };
  }
}
async function syncAllData(url) {
  if (url) {
    return await fetchAndCacheWishlist(url);
  }
  const wlRes = await fetchAndCacheWishlist();
  const sheetRes = await fetchAndCacheAegisSheet();
  return {
    success: wlRes.success && sheetRes.success,
    count: wlRes.count,
    error: wlRes.error || sheetRes.error
  };
}
chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 24 * 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log("Periodic alarm triggered. Synchronizing wishlist and spreadsheet...");
    syncAllData();
  }
});
chrome.runtime.onInstalled.addListener(() => {
  console.log("DIM Aegis Overlay installed. Performing initial data sync...");
  syncAllData();
});
chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get(["lastUpdated", "wishlistData", "aegisSheetDb"]);
  const dayInMs = 24 * 60 * 60 * 1e3;
  const now = Date.now();
  if (!data.wishlistData || !data.aegisSheetDb || !data.lastUpdated || now - data.lastUpdated > dayInMs) {
    console.log("Cache missing or expired. Performing startup sync...");
    syncAllData();
  }
});
async function syncLightGGInBackground() {
  await chrome.storage.local.set({ lightggSyncStatus: "syncing", lightggSyncError: null });
  return new Promise((resolve) => {
    let tabId = null;
    let storageListener = null;
    let timeoutId = null;
    function cleanup(success, count, error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (storageListener) chrome.storage.onChanged.removeListener(storageListener);
      if (tabId !== null) {
        chrome.tabs.remove(tabId).catch(() => {
        });
        tabId = null;
      }
      const status = success ? "done" : "error";
      chrome.storage.local.set({ lightggSyncStatus: status, lightggSyncError: error || null });
      resolve({ success, count, error });
    }
    storageListener = (changes, area) => {
      if (area !== "local") return;
      if (changes.lightggSyncStatus && changes.lightggSyncStatus.newValue === "done") {
        chrome.storage.local.get("lightggData", (res) => {
          const count = Object.keys(res.lightggData || {}).length;
          console.log(`[DIM Aegis Overlay] Light.gg background sync complete. ${count} weapons graded.`);
          cleanup(true, count);
        });
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    timeoutId = setTimeout(() => {
      console.warn("[DIM Aegis Overlay] Light.gg background sync timed out.");
      cleanup(false, void 0, "Sync timed out after 45 seconds. Light.gg may require you to be logged in.");
    }, 45e3);
    chrome.tabs.create({ url: LGG_ROLL_APPRAISER_URL, active: false }, (tab) => {
      var _a;
      if (chrome.runtime.lastError || !tab.id) {
        cleanup(false, void 0, ((_a = chrome.runtime.lastError) == null ? void 0 : _a.message) || "Failed to open tab");
        return;
      }
      tabId = tab.id;
      console.log(`[DIM Aegis Overlay] Opened hidden Light.gg tab (id=${tabId}) for background sync.`);
    });
  });
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "syncNow") {
    syncAllData(message.url).then((res) => sendResponse(res)).catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === "syncLightGG") {
    syncLightGGInBackground().then((res) => sendResponse(res)).catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  return false;
});
