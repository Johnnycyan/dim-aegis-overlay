# Release v1.4.0
This is a stable release of the DIM Aegis Overlay extension. It introduces Aegis's own armor set bonus database with an optional toggle, universal search comparison operators for weapons, perks and armor set bonuses, a manual spreadsheet resync button, GitHub update checks on version click, and a fix to resolve duplicate inline cards.

## What's New in v1.4.0

### Aegis Armor Set Bonuses Integration
* **Aegis Spreadsheet Support**: Added Aegis's own "Set Bonuses" tab database as an optional toggle alongside the LowCo armor ratings! Aegis has his own ratings for set bonuses in his master sheet, so now you can choose between the two databases. I also made sure it copies the "how to get" source and activity details from the LowCo sheet so you still know exactly where to acquire the armor! (Merging the separate 2-piece and 4-piece rows from Aegis's sheet was a bit tricky but it works perfectly now.)

### Universal Search Filter Operators
* **Comparison Support**: Added support for `>`, `>=`, `<`, and `<=` comparison operators across all filters. E.g. you can search `aegis:p:>=b` to filter for perks that are B-tier or better, or `aegis:w:>a` for weapons rated higher than A.
* (Someone asked if there was a way to search for perk tier B and higher, and I realized this was a fantastic idea. I made it universal so it works for weapons, perks, and armor set ratings! I also added "a" in the middle so it matches "w" and "p" like the other filters.)

### Settings UI & Sync Upgrades
* **Manual Spreadsheet Resync**: Added a standalone "Resync Spreadsheets" button at the very top of the popup menu so you can manually trigger an update on-demand.
* **Interactive Update Checker**: You can now click on the version badge in the popup header to check if there is an update available on GitHub!
* **No More Alert Popups**: Replaced those ugly browser alert boxes with clean, inline success and failure status messages so they don't disrupt you.
* **Filtering Help Section**: Cleaned up the Vault Search Filtering help guide into a categorized grid layout with high-contrast code badges to make it much easier to read.

### Inline Card Layout Fixes
* **Race Condition Resolution**: Fixed a race condition where having recommended perks displayed inline would cause the card to duplicate and render three times. (This should be fully fixed now!)

## Installation

### For Chromium browsers
1. Download the packaged `dim-aegis-overlay-v1.4.0.zip` file.
2. Unpack the ZIP file.
3. Open Chrome/Opera and navigate to `chrome://extensions/`.
4. Enable **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the unpacked directory.

### For Firefox
1. Download the packaged `dim-aegis-overlay-v1.4.0.zip` file.
2. Unpack the ZIP file.
3. Go to **Manage Extensions**.
4. Press the **Gear** icon at the top and select **Debug add-ons**.
5. Press **Load Temporary Add-on** and select the unzipped directory.
