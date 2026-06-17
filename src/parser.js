/**
 * Parses the raw text of a DIM wishlist file.
 * Supports standard format: dimwishlist:item=itemHash&perks=perkHash1,perkHash2,...#notes:NoteText
 * Also supports comments starting with // and plain text hashes.
 *
 * @param rawText The raw text content of the wishlist file.
 * @returns A parsed WishlistDatabase grouping rolls by itemHash.
 */
export function parseWishlist(rawText) {
    const database = {};
    const lines = rawText.split(/\r?\n/);
    let currentNotes = '';
    let currentWeaponName = '';
    for (let line of lines) {
        line = line.trim();
        // Handle comments
        if (line.startsWith('//')) {
            const lowerLine = line.toLowerCase();
            // Match "//notes:" or "// notes:"
            if (lowerLine.startsWith('//notes:') || lowerLine.startsWith('// notes:')) {
                const colonIndex = line.indexOf(':');
                currentNotes = line.substring(colonIndex + 1).trim();
            }
            else {
                const cleanComment = line.replace(/^\/\/+/g, '').trim();
                const lowerComment = cleanComment.toLowerCase();
                if (cleanComment &&
                    !lowerComment.startsWith('notes:') &&
                    !lowerComment.startsWith('title:') &&
                    !lowerComment.startsWith('description:')) {
                    currentWeaponName = cleanComment;
                }
                // If it's a normal comment (e.g. weapon name header), reset notes
                // to prevent notes from leaking across different weapons.
                currentNotes = '';
            }
            continue;
        }
        // Skip empty lines
        if (!line) {
            continue;
        }
        // Check if the line is a DIM wishlist entry
        if (!line.includes('dimwishlist:')) {
            continue;
        }
        try {
            // Split into query part and notes part (demarcated by #)
            const hashIndex = line.indexOf('#');
            let queryPart = line;
            let notes = currentNotes; // Default to the preceding comment notes
            if (hashIndex !== -1) {
                queryPart = line.substring(0, hashIndex).trim();
                const rawNotes = line.substring(hashIndex + 1).trim();
                // Remove "notes:" prefix if present
                if (rawNotes.toLowerCase().startsWith('notes:')) {
                    notes = rawNotes.substring(6).trim();
                }
                else {
                    notes = rawNotes;
                }
            }
            // Parse item hash
            const itemMatch = queryPart.match(/item=(-?\d+)/);
            if (!itemMatch) {
                continue;
            }
            const itemHash = parseInt(itemMatch[1], 10);
            // Parse perks
            const perksMatch = queryPart.match(/perks=([\d,]+)/);
            if (!perksMatch) {
                continue;
            }
            const perks = perksMatch[1]
                .split(',')
                .map((p) => parseInt(p.trim(), 10))
                .filter((p) => !isNaN(p));
            if (perks.length === 0) {
                continue;
            }
            const roll = {
                itemHash,
                perks,
                notes,
                title: currentWeaponName || undefined,
            };
            if (!database[itemHash]) {
                database[itemHash] = [];
            }
            database[itemHash].push(roll);
        }
        catch (e) {
            console.error('Failed to parse wishlist line:', line, e);
        }
    }
    return database;
}
