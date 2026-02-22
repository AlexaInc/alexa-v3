const groupMetadataCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetches group metadata with caching.
 * @param {Object} AlexaInc The Baileys socket instance.
 * @param {string} jid The JID of the group.
 * @returns {Promise<Object|null>} The group metadata or null if it fails.
 */
async function getCachedGroupMetadata(AlexaInc, jid) {
    const now = Date.now();
    const cached = groupMetadataCache.get(jid);

    if (cached && (now - cached.timestamp < CACHE_TTL)) {
        return cached.data;
    }

    try {
        const metadata = await AlexaInc.groupMetadata(jid);
        if (metadata) {
            groupMetadataCache.set(jid, {
                data: metadata,
                timestamp: now
            });
        }
        return metadata;
    } catch (err) {
        console.error(`[CacheHelper] Error fetching group metadata for ${jid}:`, err.message);
        // If we have an old cache entry, return it as a fallback even if expired
        if (cached) return cached.data;
        return null;
    }
}

/**
 * Clears the cache for a specific group (e.g., when participants change).
 * @param {string} jid The JID of the group.
 */
function clearGroupCache(jid) {
    groupMetadataCache.delete(jid);
}

module.exports = {
    getCachedGroupMetadata,
    clearGroupCache
};
