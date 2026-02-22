const NodeCache = require('node-cache');

// stdTTL: 600 (10 minutes), maxKeys: 500 to bound memory usage
const groupMetadataCache = new NodeCache({ stdTTL: 600, maxKeys: 500 });
const groupSettingsCache = new NodeCache({ stdTTL: 600, maxKeys: 500 });

const pendingMetadataRequests = new Map();
const pendingSettingsRequests = new Map();

/**
 * Fetches group metadata with caching and request deduplication.
 */
async function getCachedGroupMetadata(AlexaInc, jid) {
    const cached = groupMetadataCache.get(jid);
    if (cached) return cached;

    // Check if there's already a request in progress for this JID
    if (pendingMetadataRequests.has(jid)) {
        return pendingMetadataRequests.get(jid);
    }

    const requestPromise = (async () => {
        try {
            const metadata = await AlexaInc.groupMetadata(jid);
            if (metadata) {
                groupMetadataCache.set(jid, metadata);
            }
            return metadata;
        } catch (err) {
            console.error(`[CacheHelper] Error fetching group metadata for ${jid}:`, err.message);
            return null;
        } finally {
            pendingMetadataRequests.delete(jid);
        }
    })();

    pendingMetadataRequests.set(jid, requestPromise);
    return requestPromise;
}

/**
 * Fetches group settings from MySQL with caching and deduplication.
 */
async function getCachedGroupSettings(db, jid) {
    const cached = groupSettingsCache.get(jid);
    if (cached) return cached;

    if (pendingSettingsRequests.has(jid)) {
        return pendingSettingsRequests.get(jid);
    }

    const requestPromise = (async () => {
        try {
            const sql = "SELECT * FROM `groups` WHERE group_id = ?";
            const [results] = await db.promise().query(sql, [jid]);

            const settings = results.length > 0 ? results[0] : null;
            if (settings) {
                groupSettingsCache.set(jid, settings);
            }
            return settings;
        } catch (err) {
            console.error(`[CacheHelper] Error fetching group settings for ${jid}:`, err.message);
            return null;
        } finally {
            pendingSettingsRequests.delete(jid);
        }
    })();

    pendingSettingsRequests.set(jid, requestPromise);
    return requestPromise;
}

/**
 * Clears the metadata cache for a specific group.
 */
function clearGroupCache(jid) {
    groupMetadataCache.del(jid);
}

/**
 * Clears the settings cache for a specific group.
 */
function clearSettingsCache(jid) {
    groupSettingsCache.del(jid);
}

module.exports = {
    getCachedGroupMetadata,
    getCachedGroupSettings,
    clearGroupCache,
    clearSettingsCache
};
