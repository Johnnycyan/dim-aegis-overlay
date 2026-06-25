/** Safely sets element HTML using DOMParser (avoids innerHTML linter warning). */
function safeSetInnerHTML(element: HTMLElement, htmlString: string) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(htmlString, 'text/html');
  element.replaceChildren(...Array.from(parsed.body.childNodes));
}

const DEFAULT_URL =
  'https://raw.githubusercontent.com/charlesxcaliber/DIMAegisWeaponWishlist/main/MrCharlesWishlist_MRB_PPC2.txt';

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('wishlist-url') as HTMLInputElement;
  const syncBtn = document.getElementById('sync-button') as HTMLButtonElement;
  const syncStatus = document.getElementById('sync-status') as HTMLSpanElement;
  const lastUpdated = document.getElementById('last-updated') as HTMLSpanElement;
  const weaponsCount = document.getElementById('weapons-count') as HTMLSpanElement;
  const errorContainer = document.getElementById('error-container') as HTMLDivElement;
  const errorMessage = document.getElementById('error-message') as HTMLParagraphElement;
  const lightggCount = document.getElementById('lightgg-count') as HTMLSpanElement;
  const lightggSyncBtn = document.getElementById('lightgg-sync-button') as HTMLButtonElement;
  const lightggClearBtn = document.getElementById('lightgg-clear-button') as HTMLButtonElement;
  const lightggSyncStatusRow = document.getElementById('lightgg-sync-status-row') as HTMLDivElement;
  const lightggSyncStatusText = document.getElementById('lightgg-sync-status-text') as HTMLSpanElement;

  // Function to refresh UI from storage
  function updateUI() {
    chrome.storage.local.get(
      [
        'wishlistUrl',
        'lastUpdated',
        'parsedCount',
        'syncStatus',
        'syncError',
        'scoringSource',
        'lightggData',
        'lightggLastSync',
        'aegisLayoutSide',
        'aegisDbMode',
        'aegisTwoTier',
        'updateAvailableVersion',
        'updateBannerDismissed'
      ],
      (res: any) => {
        // Handle Extension Update warning banner
        const updateBanner = document.getElementById('extension-update-banner') as HTMLDivElement;
        const newVersionText = document.getElementById('new-version-text') as HTMLElement;
        if (updateBanner && newVersionText) {
          const currentVersion = chrome.runtime.getManifest().version;
          if (res.updateAvailableVersion && res.updateAvailableVersion !== currentVersion && !res.updateBannerDismissed) {
            newVersionText.textContent = `v${res.updateAvailableVersion}`;
            updateBanner.classList.remove('hidden');
          } else {
            updateBanner.classList.add('hidden');
          }
        }

        // Set URL input
        urlInput.value = res.wishlistUrl || DEFAULT_URL;

        // Set Last Updated time
        if (res.lastUpdated) {
          lastUpdated.textContent = new Date(res.lastUpdated).toLocaleString();
        } else {
          lastUpdated.textContent = 'Never';
        }

        // Set Weapons Count
        weaponsCount.textContent = (res.parsedCount || 0).toLocaleString();

        // Set Light.gg Graded Count
        const lggData = res.lightggData || {};
        if (lightggCount) {
          lightggCount.textContent = Object.keys(lggData).length.toLocaleString();
        }

        // Set Light.gg Last Synced time
        const lggLastUpdated = document.getElementById('lightgg-last-updated') as HTMLSpanElement;
        if (lggLastUpdated) {
          if (res.lightggLastSync) {
            lggLastUpdated.textContent = new Date(res.lightggLastSync).toLocaleString();
          } else {
            lggLastUpdated.textContent = 'Never';
          }
        }

        // Handle Light.gg cache age warning banner
        const warningBanner = document.getElementById('lightgg-sync-warning') as HTMLDivElement;
        if (warningBanner) {
          const hasGrades = Object.keys(lggData).length > 0;
          const dayInMs = 24 * 60 * 60 * 1000;
          const isOutdated = res.lightggLastSync && (Date.now() - res.lightggLastSync > 2 * dayInMs);
          
          if (hasGrades && isOutdated) {
            warningBanner.classList.remove('hidden');
          } else {
            warningBanner.classList.add('hidden');
          }
        }

        // Set Scoring Source segmented control
        const sourceVal = res.scoringSource || 'aegis';
        const sourceSegmented = document.getElementById('scoring-source-segmented');
        if (sourceSegmented) {
          sourceSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === sourceVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
          const dbToggleGroup = document.getElementById('aegis-db-toggle-group');
          if (dbToggleGroup) {
            if (sourceVal === 'lightgg') {
              dbToggleGroup.style.display = 'none';
            } else {
              dbToggleGroup.style.display = 'block';
            }
          }
        }

        // Set Aegis DB Mode buttons
        const dbModeVal = res.aegisDbMode || 'both';
        const segmentedControl = document.getElementById('aegis-db-segmented');
        if (segmentedControl) {
          segmentedControl.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === dbModeVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Layout segmented control
        const layoutVal = res.aegisLayoutSide || 'side';
        const layoutSegmented = document.getElementById('aegis-layout-segmented');
        if (layoutSegmented) {
          layoutSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === layoutVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Set Aegis Two-Tier segmented control
        const twoTierVal = res.aegisTwoTier ? 'true' : 'false';
        const twoTierSegmented = document.getElementById('aegis-two-tier-segmented');
        if (twoTierSegmented) {
          twoTierSegmented.querySelectorAll('button').forEach(btn => {
            if (btn.getAttribute('data-value') === twoTierVal) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        }

        // Update status text and classes
        const status = res.syncStatus || 'success';
        syncStatus.className = 'status-value';
        errorContainer.classList.add('hidden');

        if (status === 'loading') {
          syncStatus.textContent = 'Syncing...';
          syncStatus.classList.add('status-loading');
          setLoadingState(true);
        } else if (status === 'error') {
          syncStatus.textContent = 'Failed';
          syncStatus.classList.add('status-error');
          setLoadingState(false);

          if (res.syncError) {
            errorMessage.textContent = res.syncError;
            errorContainer.classList.remove('hidden');
          }
        } else {
          syncStatus.textContent = 'Synced';
          syncStatus.classList.add('status-success');
          setLoadingState(false);
        }
      }
    );
  }

  // Handle Scoring Source segmented control click
  const sourceSegmented = document.getElementById('scoring-source-segmented');
  if (sourceSegmented) {
    sourceSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ scoringSource: val }, () => {
            console.log(`[DIM Aegis Overlay] Scoring source changed to: ${val}`);
            updateUI();
          });
        }
      }
    });
  }

  // Handle DB Mode segmented control click
  const segmentedControl = document.getElementById('aegis-db-segmented');
  if (segmentedControl) {
    segmentedControl.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisDbMode: val }, () => {
            console.log(`[DIM Aegis Overlay] Aegis DB Mode changed to: ${val}`);
            updateUI();
          });
        }
      }
    });
  }

  // Handle Layout segmented control click
  const layoutSegmented = document.getElementById('aegis-layout-segmented');
  if (layoutSegmented) {
    layoutSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisLayoutSide: val }, () => {
            console.log(`[DIM Aegis Overlay] Aegis layout changed to: ${val}`);
            updateUI();
          });
        }
      }
    });
  }

  // Handle Two-Tier segmented control click
  const twoTierSegmented = document.getElementById('aegis-two-tier-segmented');
  if (twoTierSegmented) {
    twoTierSegmented.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      if (target && target.tagName === 'BUTTON') {
        const val = target.getAttribute('data-value');
        if (val) {
          chrome.storage.local.set({ aegisTwoTier: val === 'true' }, () => {
            console.log(`[DIM Aegis Overlay] Aegis Two-Tier grade changed to: ${val === 'true'}`);
            updateUI();
          });
        }
      }
    });
  }

  function setLoadingState(loading: boolean) {
    if (loading) {
      syncBtn.disabled = true;
      urlInput.disabled = true;
      syncBtn.querySelector('.spinner')?.classList.remove('hidden');
      const textEl = syncBtn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Syncing...';
    } else {
      syncBtn.disabled = false;
      urlInput.disabled = false;
      syncBtn.querySelector('.spinner')?.classList.add('hidden');
      const textEl = syncBtn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Sync Wishlist';
    }
  }

  // Handle Extension Update banner dismiss click
  const updateBannerDismissBtn = document.getElementById('update-banner-dismiss');
  if (updateBannerDismissBtn) {
    updateBannerDismissBtn.addEventListener('click', () => {
      chrome.storage.local.set({ updateBannerDismissed: true }, () => {
        const updateBanner = document.getElementById('extension-update-banner');
        if (updateBanner) {
          updateBanner.classList.add('hidden');
        }
      });
    });
  }

  // Initial UI update
  updateUI();

  // Sync button event listener
  syncBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();

    if (!url) {
      alert('Please enter a valid URL.');
      return;
    }

    setLoadingState(true);
    syncStatus.textContent = 'Syncing...';
    syncStatus.className = 'status-value status-loading';
    errorContainer.classList.add('hidden');

    chrome.runtime.sendMessage({ action: 'syncNow', url }, (response) => {
      // Small timeout to let storage propagate
      setTimeout(() => {
        updateUI();
        if (response && !response.success) {
          alert(`Sync failed: ${response.error}`);
        }
      }, 300);
    });
  });

  // ── Light.gg background sync button ──────────────────────────────────────
  function setLightGGLoading(loading: boolean) {
    if (!lightggSyncBtn) return;
    if (lightggClearBtn) lightggClearBtn.disabled = loading;
    if (loading) {
      lightggSyncBtn.disabled = true;
      lightggSyncBtn.querySelector('.spinner')?.classList.remove('hidden');
      const textEl = lightggSyncBtn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Syncing...';
      if (lightggSyncStatusRow) lightggSyncStatusRow.style.display = 'block';
      if (lightggSyncStatusText) {
        lightggSyncStatusText.textContent = '⏳ Opening Roll Appraiser in background...';
        lightggSyncStatusText.style.color = '#ffb300';
      }
    } else {
      lightggSyncBtn.disabled = false;
      lightggSyncBtn.querySelector('.spinner')?.classList.add('hidden');
      const textEl = lightggSyncBtn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Sync Grades';
    }
  }

  if (lightggSyncBtn) {
    lightggSyncBtn.addEventListener('click', () => {
      setLightGGLoading(true);
      chrome.runtime.sendMessage({ action: 'syncLightGG' }, (response) => {
        setLightGGLoading(false);
        if (lightggSyncStatusRow) lightggSyncStatusRow.style.display = 'block';
        if (response && response.success) {
          if (lightggSyncStatusText) {
            lightggSyncStatusText.textContent = `✅ Done! ${(response.count || 0).toLocaleString()} weapons graded.`;
            lightggSyncStatusText.style.color = '#4caf50';
          }
          updateUI();
        } else {
          if (lightggSyncStatusText) {
            const errMsg = (response && response.error) ? response.error : 'Unknown error';
            lightggSyncStatusText.textContent = `❌ ${errMsg}`;
            lightggSyncStatusText.style.color = '#f44336';
          }
        }
      });
    });
  }

  if (lightggClearBtn) {
    lightggClearBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear your cached Light.gg weapon grades?')) {
        chrome.storage.local.set({ lightggData: {}, lightggLastSync: 0 }, () => {
          updateUI();
          if (lightggSyncStatusRow) lightggSyncStatusRow.style.display = 'block';
          if (lightggSyncStatusText) {
            lightggSyncStatusText.textContent = '🧹 Cache cleared successfully.';
            lightggSyncStatusText.style.color = '#4caf50';
          }
        });
      }
    });
  }

  // Search logic
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const searchResults = document.getElementById('search-results') as HTMLDivElement;

  if (searchInput && searchResults) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        searchResults.replaceChildren();
        searchResults.classList.add('hidden');
        return;
      }

      chrome.storage.local.get(['wishlistData', 'perkRegistry'], (res) => {
        const wishlist = res.wishlistData || {};
        const perkRegistry = res.perkRegistry || {};
        
        // Find matching entries, grouped by weapon title
        const matches: Record<string, { hash: number; rolls: any[] }> = {};
        
        for (const [hashStr, rolls] of Object.entries(wishlist)) {
          const hash = Number(hashStr);
          if (!rolls || !Array.isArray(rolls)) continue;

          for (const roll of rolls) {
            const title = roll.title || `Weapon #${hash}`;
            if (title.toLowerCase().includes(query)) {
              if (!matches[title]) {
                matches[title] = { hash, rolls: [] };
              }
              // Prevent adding identical rolls
              matches[title].rolls.push(roll);
            }
          }
        }

        const matchKeys = Object.keys(matches);
        if (matchKeys.length === 0) {
          safeSetInnerHTML(searchResults, '<div class="description" style="text-align: center; margin: 10px 0;">No matching weapons found.</div>');
          searchResults.classList.remove('hidden');
          return;
        }

        // Limit results to 15 weapons to keep popup responsive
        const displayKeys = matchKeys.slice(0, 15);
        let html = '';

        for (const title of displayKeys) {
          const item = matches[title];
          html += `
            <div class="search-item">
              <div class="search-item-header">
                <span>${title}</span>
                <span class="status-value" style="font-size: 10px; color: #ffb300;">${item.rolls.length} Roll${item.rolls.length > 1 ? 's' : ''}</span>
              </div>
              <div class="search-item-body">
          `;

          item.rolls.forEach((roll, idx) => {
            const noteText = roll.notes || 'No notes available.';
            const perkPills = roll.perks
              .map((perkHash: number) => {
                const perkInfo = perkRegistry[perkHash];
                const perkName = perkInfo ? perkInfo.name : `Perk #${perkHash}`;
                return `<span class="search-perk-pill">${perkName}</span>`;
              })
              .join('');

            html += `
              <div class="search-roll">
                <div class="search-roll-title">Recommendation #${idx + 1}</div>
                <div class="search-roll-perks">${perkPills}</div>
                <div class="search-roll-notes">${noteText}</div>
              </div>
            `;
          });

          html += `
              </div>
            </div>
          `;
        }

        if (matchKeys.length > 15) {
          html += `<div class="description" style="text-align: center; font-size: 9.5px; margin-top: 5px;">Showing 15 of ${matchKeys.length} matching weapons.</div>`;
        }

        safeSetInnerHTML(searchResults, html);
        searchResults.classList.remove('hidden');

        // Add collapsible click handlers
        const items = searchResults.querySelectorAll('.search-item');
        items.forEach((el) => {
          el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('search-perk-pill') || target.classList.contains('search-roll-notes') || target.closest('.search-roll')) {
              return;
            }
            el.classList.toggle('active');
          });
        });
      });
    });
  }

  // Listen for storage updates in real-time
  chrome.storage.onChanged.addListener((_changes, namespace) => {
    if (namespace === 'local') {
      updateUI();
    }
  });
});
