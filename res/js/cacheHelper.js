const NodeCache = require('node-cache');

// stdTTL: 300 (5 minutes), maxKeys: 150 to keep memory footprint small on 512MB RAM
const groupMetadataCache = new NodeCache({ stdTTL: 300, maxKeys: 150 });
const groupSettingsCache = new NodeCache({ stdTTL: 300, maxKeys: 150 });

const pendingMetadataRequests = new Map();
const pendingSettingsRequests = new Map();

let alexaInstance = null;

function setAlexaInstance(instance) {
    alexaInstance = instance;
}

/**
 * Fetches group metadata with caching and request deduplication.
 */
async function getCachedGroupMetadata(arg1, arg2) {
    let jid, socket;

    // Baileys calls it with (jid), my bot.js calls it with (socket, jid)
    if (typeof arg1 === 'string') {
        jid = arg1;
        socket = arg2 || alexaInstance;
    } else {
        socket = arg1 || alexaInstance;
        jid = arg2;
    }

    if (!jid) {
        console.error('[CacheHelper] getCachedGroupMetadata called with undefined JID');
        return null;
    }

    if (!socket) {
        console.warn(`[CacheHelper] No socket available for metadata fetch of ${jid}`);
        return null;
    }

    const cached = groupMetadataCache.get(jid);
    if (cached) return cached;

    // Check if there's already a request in progress for this JID
    if (pendingMetadataRequests.has(jid)) {
        return pendingMetadataRequests.get(jid);
    }

    const requestPromise = (async () => {
        try {
            const metadata = await socket.groupMetadata(jid);
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
    if (!jid) {
        console.error('[CacheHelper] getCachedGroupSettings called with undefined JID');
        return null;
    }
    const cached = groupSettingsCache.get(jid);
    if (cached) return cached;

    if (pendingSettingsRequests.has(jid)) {
        return pendingSettingsRequests.get(jid);
    }

    const requestPromise = (async () => {
        const fetchSettings = async (retry = true) => {
            try {
                const sql = "SELECT * FROM `groups` WHERE group_id = ?";
                const [results] = await db.promise().query(sql, [jid]);
                return results.length > 0 ? results[0] : null;
            } catch (err) {
                if (retry && (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST')) {
                    console.warn(`[CacheHelper] DB connection lost for ${jid}, retrying...`);
                    return fetchSettings(false);
                }
                throw err;
            }
        };

        try {
            const settings = await fetchSettings();
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
    clearSettingsCache,
    setAlexaInstance
};
