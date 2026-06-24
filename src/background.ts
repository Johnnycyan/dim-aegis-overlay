import { parseWishlist } from './parser';

const DEFAULT_URL =
  'https://raw.githubusercontent.com/charlesxcaliber/DIMAegisWeaponWishlist/main/MrCharlesWishlist_MRB_PPC2.txt';

const SYNC_ALARM_NAME = 'sync-wishlist-alarm';
const LGG_ROLL_APPRAISER_URL = 'https://www.light.gg/god-roll/roll-appraiser/';

/**
 * Fetches the wishlist from the configured URL, parses it, and caches it in local storage.
 *
 * @param url Optional override URL. If omitted, uses the configured URL from storage or the default.
 */
async function fetchAndCacheWishlist(url?: string): Promise<{ success: boolean; count?: number; error?: string }> {
  let targetUrl: string = url || '';

  if (!targetUrl) {
    const storage = await chrome.storage.local.get('wishlistUrl');
    targetUrl = storage.wishlistUrl || DEFAULT_URL;
  }

  // Update status to loading
  await chrome.storage.local.set({
    syncStatus: 'loading',
    syncError: null,
    wishlistUrl: targetUrl,
  });

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const parsedDb = parseWishlist(text);
    const parsedCount = Object.keys(parsedDb).length;

    // Fetch enhanced-to-normal perk mapping
    let enhancedToNormal: Record<number, number> = {};
    try {
      const mapResponse = await fetch(
        'https://raw.githubusercontent.com/DestinyItemManager/d2-additional-info/master/output/trait-to-enhanced-trait.json'
      );
      if (mapResponse.ok) {
        const normalToEnhanced = (await mapResponse.json()) as Record<string, number>;
        for (const [normalStr, enhanced] of Object.entries(normalToEnhanced)) {
          const normal = parseInt(normalStr, 10);
          if (!isNaN(normal) && enhanced) {
            enhancedToNormal[enhanced] = normal;
          }
        }
      }
    } catch (mapErr) {
      console.error('Failed to fetch enhanced perk mapping:', mapErr);
    }

    await chrome.storage.local.set({
      wishlistData: parsedDb,
      lastUpdated: Date.now(),
      syncStatus: 'success',
      syncError: null,
      parsedCount,
      enhancedToNormal,
    });

    console.log(`Wishlist sync complete. Parsed ${parsedCount} items from: ${targetUrl}`);
    return { success: true, count: parsedCount };
  } catch (err: any) {
    const errMsg = err.message || String(err);
    console.error('Wishlist sync failed:', errMsg);

    await chrome.storage.local.set({
      syncStatus: 'error',
      syncError: errMsg,
    });

    return { success: false, error: errMsg };
  }
}

const SHEET_ID = '1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY';
const ALL_TABS = [
  'Autos', 'Bows', 'HCs', 'Pulses', 'Scouts', 'Sidearms', 'SMGs',
  'BGLs', 'Fusions', 'Glaives', 'Shotguns', 'Snipers',
  'Rocket Sidearms', 'Traces', 'HGLs', 'LFRs', 'LMGs', 'Rockets',
  'Swords', 'Other',
];

function parseCSV(text: string): string[][] {
  const normalizedText = text.replace(/\r\n|\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < normalizedText.length; i++) {
    const c = normalizedText[i], nx = normalizedText[i + 1];
    if (inQ) {
      if (c === '"' && nx === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (row.length || field) { row.push(field); rows.push(row); }
  return rows;
}

function normName(s: string): string {
  return (s ?? '').split('\n')[0].trim().toLowerCase();
}

function stripEdition(name: string): string {
  return name.replace(/\s*\([^)]+\)\s*$/, '').trim();
}

/**
 * Fetches Aegis spreadsheet tabs, parses them and caches the output database in local storage.
 */
async function fetchAndCacheAegisSheet(): Promise<{ success: boolean; error?: string }> {
  console.log('DIM Aegis Overlay: Fetching Aegis Master Spreadsheet...');
  const weapons: Record<string, any> = {};
  const categories: Record<string, any[]> = {};

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
      const idx: Record<string, number> = {};
      header.forEach((col, i) => {
        idx[col.trim()] = i;
      });

      const getVal = (row: string[], key: string) => {
        const i = idx[key];
        return i !== undefined ? (row[i] ?? '').trim() : '';
      };

      const categoryWeapons: any[] = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const nameVal = getVal(row, 'Name');
        if (!nameVal) continue;

        const weaponName = nameVal.split('\n')[0].trim();
        const normalized = normName(weaponName);
        const baseNormalized = normName(stripEdition(weaponName));

        const weaponData = {
          name: weaponName,
          energy: getVal(row, 'Energy'),
          frame: getVal(row, 'Frame'),
          barrel: getVal(row, 'PERKS Barrel'),
          mag: getVal(row, 'Mag'),
          perk1: getVal(row, 'Perk 1'),
          perk2: getVal(row, 'Perk 2'),
          origin: getVal(row, 'Origin Trait'),
          notes: getVal(row, 'ANALYSIS Notes'),
          rank: getVal(row, 'Rank'),
          tier: getVal(row, 'Tier'),
        };

        weapons[normalized] = weaponData;
        if (baseNormalized !== normalized) {
          weapons[baseNormalized] = weaponData;
        }

        categoryWeapons.push(weaponData);
      }

      // Sort by rank ascending
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
      aegisSheetLastSync: Date.now(),
    });

    console.log('DIM Aegis Overlay: Aegis spreadsheet sync completed successfully.');
    return { success: true };
  } catch (err: any) {
    const errMsg = err.message || String(err);
    console.error('DIM Aegis Overlay: Failed to fetch/cache Aegis spreadsheet:', errMsg);
    return { success: false, error: errMsg };
  }
}

async function syncAllData(url?: string): Promise<{ success: boolean; count?: number; error?: string }> {
  if (url) {
    // For manual wishlist sync, fetch only the wishlist to be instant and bypass slower/rate-limited sheet fetches.
    return await fetchAndCacheWishlist(url);
  }
  const wlRes = await fetchAndCacheWishlist();
  const sheetRes = await fetchAndCacheAegisSheet();
  return {
    success: wlRes.success && sheetRes.success,
    count: wlRes.count,
    error: wlRes.error || sheetRes.error,
  };
}

// Set up periodic sync alarm (every 24 hours / 1440 minutes)
chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 24 * 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log('Periodic alarm triggered. Synchronizing wishlist and spreadsheet...');
    syncAllData();
  }
});

// Run sync immediately on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('DIM Aegis Overlay installed. Performing initial data sync...');
  syncAllData();
});

// Check/sync on startup if cache is missing or expired (older than 24 hours)
chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get(['lastUpdated', 'wishlistData', 'aegisSheetDb']);
  const dayInMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (!data.wishlistData || !data.aegisSheetDb || !data.lastUpdated || now - data.lastUpdated > dayInMs) {
    console.log('Cache missing or expired. Performing startup sync...');
    syncAllData();
  }
});

/**
 * Opens the Light.gg Roll Appraiser in a hidden (inactive) tab.
 * Waits for the content script to signal completion via chrome.storage,
 * then closes the tab automatically.
 *
 * The content script writes { lightggSyncStatus: 'done' } when grades
 * are collected (either via API intercept or DOM scraping).
 */
async function syncLightGGInBackground(): Promise<{ success: boolean; count?: number; error?: string }> {
  // Mark as syncing
  await chrome.storage.local.set({ lightggSyncStatus: 'syncing', lightggSyncError: null });

  return new Promise((resolve) => {
    let tabId: number | null = null;
    let storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function cleanup(success: boolean, count?: number, error?: string) {
      if (timeoutId) clearTimeout(timeoutId);
      if (storageListener) chrome.storage.onChanged.removeListener(storageListener);
      if (tabId !== null) {
        chrome.tabs.remove(tabId).catch(() => {}); // Close the hidden tab
        tabId = null;
      }
      const status = success ? 'done' : 'error';
      chrome.storage.local.set({ lightggSyncStatus: status, lightggSyncError: error || null });
      resolve({ success, count, error });
    }

    // Watch for the content script to write { lightggSyncStatus: 'done' }
    storageListener = (changes, area) => {
      if (area !== 'local') return;
      if (changes.lightggSyncStatus && changes.lightggSyncStatus.newValue === 'done') {
        chrome.storage.local.get('lightggData', (res) => {
          const count = Object.keys(res.lightggData || {}).length;
          console.log(`[DIM Aegis Overlay] Light.gg background sync complete. ${count} weapons graded.`);
          cleanup(true, count);
        });
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    // Safety timeout: close tab after 45 seconds regardless
    timeoutId = setTimeout(() => {
      console.warn('[DIM Aegis Overlay] Light.gg background sync timed out.');
      cleanup(false, undefined, 'Sync timed out after 45 seconds. Light.gg may require you to be logged in.');
    }, 45000);

    // Open the Roll Appraiser in a background tab (not active, not focused)
    chrome.tabs.create({ url: LGG_ROLL_APPRAISER_URL, active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab.id) {
        cleanup(false, undefined, chrome.runtime.lastError?.message || 'Failed to open tab');
        return;
      }
      tabId = tab.id;
      console.log(`[DIM Aegis Overlay] Opened hidden Light.gg tab (id=${tabId}) for background sync.`);
    });
  });
}

// Listen for messages from settings popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'syncNow') {
    syncAllData(message.url)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async sendResponse
  }

  if (message.action === 'syncLightGG') {
    syncLightGGInBackground()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async sendResponse
  }

  return false;
});

