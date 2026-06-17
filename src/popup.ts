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
  const sourceSelect = document.getElementById('scoring-source') as HTMLSelectElement;
  const lightggCount = document.getElementById('lightgg-count') as HTMLSpanElement;

  // Function to refresh UI from storage
  function updateUI() {
    chrome.storage.local.get(
      ['wishlistUrl', 'lastUpdated', 'parsedCount', 'syncStatus', 'syncError', 'scoringSource', 'lightggData'],
      (res: any) => {
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
        if (lightggCount) {
          const lggData = res.lightggData || {};
          lightggCount.textContent = Object.keys(lggData).length.toLocaleString();
        }

        // Set Scoring Source dropdown value
        if (sourceSelect) {
          sourceSelect.value = res.scoringSource || 'aegis';
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

  // Handle scoring source change
  if (sourceSelect) {
    sourceSelect.addEventListener('change', () => {
      chrome.storage.local.set({ scoringSource: sourceSelect.value }, () => {
        console.log(`[DIM Aegis Overlay] Scoring source changed to: ${sourceSelect.value}`);
      });
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

  // Search logic
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const searchResults = document.getElementById('search-results') as HTMLDivElement;

  if (searchInput && searchResults) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        searchResults.innerHTML = '';
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
          searchResults.innerHTML = '<div class="description" style="text-align: center; margin: 10px 0;">No matching weapons found.</div>';
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

        searchResults.innerHTML = html;
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
