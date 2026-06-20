# DIM Aegis Overlay

A **Chrome / Opera MV3 browser extension** that overlays weapon roll grades directly inside [Destiny Item Manager (DIM)](https://app.destinyitemmanager.com), drawing from two sources:

- **Aegis Wishlist** – a community `.txt` wishlist (DIM format) you configure via URL
- **Light.gg Roll Appraiser** – live per-instance grades scraped from your Light.gg session

---

## Features

| Feature | Description |
|---|---|
| 🏅 **Grade badges** | S / A / B / C badges rendered directly on weapon tiles in DIM |
| 🔍 **Hover tooltips** | Detailed breakdown of matched & missing perks on hover |
| 🔄 **Auto-sync** | Wishlist fetched on install + every 24 hours via Chrome Alarms |
| ⚡ **Manual sync** | Force a re-fetch from the popup at any time |
| 🔎 **Weapon search** | Search your loaded wishlist by weapon name inside the popup |
| 🌐 **Light.gg integration** | Scrapes Roll Appraiser grades from Light.gg and shows them in DIM |
| ✨ **Enhanced perks** | Enhanced perks are correctly mapped to their normal counterparts |
| 📦 **MV3 compliant** | Built on Manifest V3 with a service worker background script |

---

## How It Works

```
Light.gg Roll Appraiser          Aegis Wishlist (GitHub raw URL)
        │                                   │
  lightgg-content.ts               background.ts (fetch + parse)
  (scrapes grades,                 (stores WishlistDatabase)
   stores by item ID)                        │
        │                                   │
        └──────────────┬────────────────────┘
                       │
              main-world-content.ts
         (runs in MAIN world, intercepts
          DIM's React/Redux data, annotates
          DOM elements with data-aegis-* attrs)
                       │
                  content.ts
         (ISOLATED world, reads attrs,
          calls scorer, injects badges)
                       │
                  tooltip.ts
         (renders hover tooltip overlay)
```

### Scripts

| File | World | Purpose |
|---|---|---|
| `background.ts` | Service Worker | Fetches & caches wishlist; handles alarms & messages |
| `main-world-content.ts` | MAIN | Hooks into DIM's live item data, annotates DOM elements |
| `content.ts` | ISOLATED | Reads annotations, scores weapons, injects badges |
| `lightgg-content.ts` | ISOLATED | Scrapes Roll Appraiser grades from Light.gg |
| `scorer.ts` | – | Pure scoring logic (S/A/B/C grading algorithm) |
| `parser.ts` | – | Parses DIM-format `.txt` wishlist files |
| `popup.ts` | – | Settings popup UI logic |
| `tooltip.ts` | – | Tooltip rendering |

### Grading Logic (Aegis mode)

Weapons are scored against every wishlist entry for that item hash. The **best matching roll** wins:

| Missing perks | Grade |
|---|---|
| 0 | **S** |
| 1 | **A** |
| 2 | **B** |
| 3 | **C** |
| 4+ | *(no grade)* |

---

## Installation (Unpacked Extension)

> No Chrome Web Store listing — load it as an unpacked extension in Developer Mode.

### Method A: Direct Download (Recommended for Users)

1. Go to the [Releases](https://github.com/Maxeption/dim-aegis-overlay/releases) page on GitHub.
2. Download the pre-built `dim-aegis-overlay-v1.0.0.zip` file.
3. Unzip the file to a permanent folder on your computer.
4. Open Chrome or Opera and navigate to `chrome://extensions/` (or `opera://extensions/`).
5. Enable **Developer mode** (toggle in the top-right corner).
6. Click **Load unpacked** (top-left) and select the unzipped folder (which contains `manifest.json`).

---

### Method B: Clone & Build (For Developers)

1. Clone and compile the repository:
   ```bash
   git clone https://github.com/Maxeption/dim-aegis-overlay.git
   cd dim-aegis-overlay
   npm install
   npm run build
   ```
   The compiled extension files will be created in the `dist/` directory.

2. Load in Chrome or Opera:
   - Go to `chrome://extensions/` (or `opera://extensions/`).
   - Enable **Developer mode** (toggle, top-right).
   - Click **Load unpacked** and select the compiled `dist/` folder.

---

### Configuration

1. Click the extension icon in your browser toolbar to open the settings popup.
2. Select your preferred **Scoring Engine** (Aegis Wishlist or Light.gg Roll Appraiser).
3. If using Aegis, click **Sync Wishlist** to fetch recommendations.
4. If using Light.gg, click **Sync Grades** to download appraisals.
5. Open or refresh Destiny Item Manager (DIM) — grade badges and pulsing gold glows will appear on your items.

---

## Scoring Sources

Switch between sources in the popup dropdown:

### Aegis (default)
Loads a community `.txt` wishlist file (DIM format) from any public URL. Grades are computed locally based on perk matching.

**Default URL:**
```
https://raw.githubusercontent.com/charlesxcaliber/DIMAegisWeaponWishlist/main/MrCharlesWishlist_MRB_PPC2.txt
```
You can substitute any DIM-compatible wishlist URL.

### Light.gg
Navigate to [light.gg/god-roll/roll-appraiser](https://www.light.gg/god-roll/roll-appraiser/) with your weapons loaded. The extension scrapes the per-instance grades from that page and stores them locally. Then, back in DIM, badges reflect the Light.gg community grades.

---

## Development

```bash
npm install      # install dev dependencies
npm run dev      # start Vite in watch mode
npm run build    # production build → dist/
```

> The build is intentionally **unminified** (`minify: false` in `vite.config.ts`) for auditability.

### Stack

- **TypeScript** — all source files
- **Vite** — bundler with multiple entry points
- **Chrome Extensions MV3** — service worker, content scripts, isolated / main worlds

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist wishlist data & settings |
| `alarms` | Periodic 24-hour wishlist sync |
| `unlimitedStorage` | Large wishlist databases |
| `https://raw.githubusercontent.com/*` | Fetch wishlist files |
| `https://app.destinyitemmanager.com/*` | Inject content scripts into DIM |
| `https://www.light.gg/*` | Scrape Roll Appraiser grades |

---

## Project Structure

```
dim-aegis-overlay/
├── public/
│   ├── manifest.json       # Extension manifest (MV3)
│   ├── popup.html          # Settings popup markup
│   └── styles.css          # Badge & tooltip styles injected into DIM
├── src/
│   ├── background.ts       # Service worker
│   ├── content.ts          # Badge injector (isolated world)
│   ├── lightgg-content.ts  # Light.gg scraper (isolated world)
│   ├── main-world-content.ts # DIM data interceptor (main world)
│   ├── parser.ts           # Wishlist .txt parser
│   ├── popup.ts            # Popup logic
│   ├── scorer.ts           # Grading algorithm
│   ├── tooltip.ts          # Tooltip renderer
│   └── types.ts            # Shared TypeScript types
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## License

MIT
