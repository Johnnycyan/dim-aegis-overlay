import { parseWishlist } from './parser';
const DEFAULT_URL = 'https://raw.githubusercontent.com/charlesxcaliber/DIMAegisWeaponWishlist/main/MrCharlesWishlist_MRB_PPC2.txt';
const SYNC_ALARM_NAME = 'sync-wishlist-alarm';
/**
 * Fetches the wishlist from the configured URL, parses it, and caches it in local storage.
 *
 * @param url Optional override URL. If omitted, uses the configured URL from storage or the default.
 */
async function fetchAndCacheWishlist(url) {
    let targetUrl = url || '';
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
        let enhancedToNormal = {};
        try {
            const mapResponse = await fetch('https://raw.githubusercontent.com/DestinyItemManager/d2-additional-info/master/output/trait-to-enhanced-trait.json');
            if (mapResponse.ok) {
                const normalToEnhanced = (await mapResponse.json());
                for (const [normalStr, enhanced] of Object.entries(normalToEnhanced)) {
                    const normal = parseInt(normalStr, 10);
                    if (!isNaN(normal) && enhanced) {
                        enhancedToNormal[enhanced] = normal;
                    }
                }
            }
        }
        catch (mapErr) {
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
    }
    catch (err) {
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
// Listen for messages from settings popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'syncNow') {
        fetchAndCacheWishlist(message.url)
            .then((res) => sendResponse(res))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true; // Keep message channel open for async sendResponse
    }
    return false;
});
