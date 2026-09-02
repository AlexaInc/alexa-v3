// pollManager.js
const { getAggregateVotesInPollMessage } = require('@hansaka02/baileys');

// --- Helper Functions & Global Setup ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const activePolls = new Map();
let mainStore;

// Helper function to get a message from the store
async function getMessage(key) {
    if (mainStore) {
        // NOTE: This requires your main bot file to call 'store.bind(AlexaInc.ev)'
        const msg = await mainStore.loadMessage(key.remoteJid, key.id);
        return msg?.message;
    }
    return undefined;
}

/**
 * Initializes the poll listener.
 * Call this *once* in your main bot file after connecting.
 * @param {any} socket - Your main Baileys socket (AlexaInc)
 * @param {any} store - Your makeInMemoryStore instance
 */
function initPollListener(socket, store) {
    mainStore = store;

    // Listener to track and decrypt votes in real-time
    socket.ev.on("messages.update", async (chatUpdate) => {
        for(const { key, update } of chatUpdate) {
             if(update.pollUpdates && key.fromMe && activePolls.has(key.id)) {
                
                const pollCreation = await getMessage(key);
                
                if(pollCreation) {
                    const aggregatedVotes = await getAggregateVotesInPollMessage({
                        message: pollCreation,
                        pollUpdates: update.pollUpdates,
                    });

                    const newCounts = {};
                    aggregatedVotes.forEach(option => {
                        newCounts[option.name] = option.voters.length;
                    });

                    activePolls.set(key.id, newCounts);
                    console.log(`[Poll Vote] Poll ${key.id} updated:`, newCounts);
                }
             }
        } 
    });

    console.log('[PollManager] Poll listener initialized successfully.');
}

/**
 * Sends a poll, waits for a timeout, reads votes, and then 
 * sends a *NEW* message of type 'pollResult' with the counts.
 *
// Inside pollManager.js
// ... (keep initPollListener as it is)

// ...

/**
 * Sends a poll, waits for a timeout, reads votes, and then 
 * sends a *NEW* message of type 'pollResult' with the counts.
 *
 * @param {any} socket - Your main Baileys socket (AlexaInc)
 * @param {string} jid - The chat ID to send to
 * @param {string} pollName - The poll question
 * @param {string[]} pollOptions - The poll options (array of strings)
 * @param {number} timeoutInSeconds - How long to wait before sending results
 */
async function sendPollAndSendResult(
    socket, 
    jid,
    pollName,
    pollOptions,
    timeoutInSeconds
) {
    try {
        if (!mainStore) {
            console.error('[PollManager] Error: Poll listener not initialized. Call initPollListener() first.');
            return;
        }

        console.log(`[PollManager] Sending poll to ${jid}...`);
        const sentPoll = await socket.sendMessage(
            jid,
            {
                poll: {
                    name: pollName,
                    values: pollOptions,
                    selectableCount: 1
                }
            }
        );
        
        // --- 🔥 CRITICAL FIX: Add delay for store write ---
        // We wait 1.5 seconds to ensure Baileys has written the full message
        // data to the store before any vote updates start coming in.
        await delay(1500); 
        console.log('[PollManager] Store write ensured. Starting vote count.');
        
        // --- Rest of the logic remains the same ---
        const pollKey = sentPoll.key.id;
        const initialVotes = {};
        pollOptions.forEach(option => {
            initialVotes[option] = 0;
        });
        activePolls.set(pollKey, initialVotes);
        console.log(`[PollManager] Poll ${pollKey} is now active for ${timeoutInSeconds}s.`);

        await delay(timeoutInSeconds * 1000);

        const finalCounts = activePolls.get(pollKey) || initialVotes;
        activePolls.delete(pollKey);
        console.log(`[PollManager] Poll ${pollKey} finished. Compiling results.`);

        // Format: [['Option 1', 10], ['Option 2', 5]]
        const formattedResults = Object.entries(finalCounts); 

        // Send a NEW pollResult message
        await socket.sendMessage(
            jid,
            {
                pollResult: {
                    name: `Final Results for: ${pollName}`, 
                    values: formattedResults      
                }
            }
        );
        console.log('[PollManager] Poll results sent as a new message.');

    } catch (error) {
        console.error("[PollManager] Error in sendPollAndSendResult:", error);
    }
}
// ... (export block remains the same)

// --- Export the functions ---
module.exports = {
    initPollListener,
    sendPollAndSendResult
};