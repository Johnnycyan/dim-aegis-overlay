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

// Set up periodic sync alarm (every 24 hours / 1440 minutes)
chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 24 * 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log('Periodic alarm triggered. Synchronizing wishlist...');
    fetchAndCacheWishlist();
  }
});

// Run sync immediately on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('DIM Aegis Overlay installed. Performing initial wishlist sync...');
  fetchAndCacheWishlist();
});

// Check/sync on startup if cache is missing or expired (older than 24 hours)
chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get(['lastUpdated', 'wishlistData']);
  const dayInMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (!data.wishlistData || !data.lastUpdated || now - data.lastUpdated > dayInMs) {
    console.log('Wishlist cache missing or expired. Performing startup sync...');
    fetchAndCacheWishlist();
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
    fetchAndCacheWishlist(message.url)
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

