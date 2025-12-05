const fs = require('fs');

// --- 1. CONFIGURATION ---
const DICTIONARY_FILE = './dictionary.txt';
const JOIN_TIME_MS = 60 * 1000;       // 60 Seconds to join
const INACTIVITY_MS = 5 * 60 * 1000;  // 5 Minutes max idle time

// --- 2. GLOBAL VARIABLES ---
let chainDictionary = [];
let MAX_POSSIBLE_LENGTH = 0; // Will be calculated from dictionary
const chainSessions = {};    // Stores active games

// --- 3. LOAD DICTIONARY ---
try {
    if (fs.existsSync(DICTIONARY_FILE)) {
        const content = fs.readFileSync(DICTIONARY_FILE, 'utf8');
        chainDictionary = content
            .split(/\r?\n/)
            .map(w => w.trim().toLowerCase())
            .filter(w => w.length > 0);

        // Calculate the longest word to set the difficulty cap
        MAX_POSSIBLE_LENGTH = chainDictionary.reduce((max, word) => Math.max(max, word.length), 0);

        console.log(`WordChain: Loaded ${chainDictionary.length} words.`);
        console.log(`WordChain: Longest word is ${MAX_POSSIBLE_LENGTH} letters.`);
    } else {
        console.error('WordChain: dictionary.txt not found! Game will not work.');
        chainDictionary = [];
    }
} catch (err) {
    console.error('WordChain: Error loading dictionary:', err);
}

// --- 4. GAME LOGIC ---

/**
 * Starts a player's turn with elimination timer.
 */
async function startChainTurn(chatId, AlexaInc) {
    const game = chainSessions[chatId];
    if (!game || game.players.length < 2) {
        return handleChainWin(chatId, AlexaInc);
    }

    // Wrap index if it exceeds player count
    if (game.turnIndex >= game.players.length) {
        game.turnIndex = 0;
        game.roundCount++;
        adjustChainDifficulty(game);
    }

    const userId = game.players[game.turnIndex];
    const username = game.playerNames[userId];

    const turnMessage = `⏳ *Round ${game.roundCount}*\n` +
        `Current Letter: 🔤 *${game.lastLetter.toUpperCase()}* 🔤\n` +
        `👉 @${userId.split('@')[0]}, it's your turn!\n` +
        `⏱️ Time: ${game.currentTurnTimeLimit}s\n` +
        `📏 Min Length: ${game.currentMinWordLength} letters`;

    await AlexaInc.sendMessage(chatId, { 
        text: turnMessage, 
        mentions: [userId] // Tag the user so they get notified
    });

    // Elimination Timer
    if (game.turnTimer) clearTimeout(game.turnTimer);
    
    game.turnTimer = setTimeout(() => {
        eliminatePlayer(chatId, userId, AlexaInc);
    }, game.currentTurnTimeLimit * 1000);
}

/**
 * Adjusts difficulty: Time decreases, Length increases (capped at max dictionary length).
 */
function adjustChainDifficulty(game) {
    // 1. Decrease Time (Min 5s)
    if (game.currentTurnTimeLimit > 5) {
        // Decrease by 5s normally, stop at 10s minimum for fairness
        if (game.currentTurnTimeLimit > 10) game.currentTurnTimeLimit -= 5;
    }

    // 2. Increase Word Length
    // Increases by 1 every 2 rounds
    if (game.roundCount > 2) {
        const newLength = 3 + Math.floor((game.roundCount - 1) / 2);
        
        // CAP: Do not exceed the longest word in dictionary.txt
        game.currentMinWordLength = Math.min(newLength, MAX_POSSIBLE_LENGTH);
    }
}

async function eliminatePlayer(chatId, userId, AlexaInc) {
    const game = chainSessions[chatId];
    if (!game) return;

    const username = game.playerNames[userId];
    await AlexaInc.sendMessage(chatId, { text: `💀 *Time's up!* @${userId.split('@')[0]} eliminated!`, mentions: [userId] });

    // Remove player
    game.players = game.players.filter(id => id !== userId);
    
    // Check Win
    if (game.players.length === 1) {
        handleChainWin(chatId, AlexaInc);
    } else {
        // Turn passes automatically because index stays same or wraps
        // Note: We don't increment turnIndex here because the array shrank
        if (game.turnIndex >= game.players.length) {
            game.turnIndex = 0;
        }
        startChainTurn(chatId, AlexaInc);
    }
}

async function handleChainWin(chatId, AlexaInc) {
    const game = chainSessions[chatId];
    if (!game) return;
    if (game.turnTimer) clearTimeout(game.turnTimer);

    if (game.players.length === 1) {
        const winnerId = game.players[0];
        const winnerName = game.playerNames[winnerId];
        await AlexaInc.sendMessage(chatId, { 
            text: `🏆 *VICTORY!* 🏆\n\n*${winnerName}* (@${winnerId.split('@')[0]}) is the Word Chain Champion!`,
            mentions: [winnerId]
        });
    } else {
        await AlexaInc.sendMessage(chatId, { text: "Game ended. Not enough players." });
    }
    delete chainSessions[chatId];
}

// --- 5. COMMAND HANDLERS ---

async function handleStartChain(msg, AlexaInc) {
    const chatId = msg.key.remoteJid;

    if (chainSessions[chatId]) {
        return AlexaInc.sendMessage(chatId, { text: "A Word Chain game is already active in this chat." }, { quoted: msg });
    }
    if (chainDictionary.length === 0) {
        return AlexaInc.sendMessage(chatId, { text: "⚠️ Dictionary not loaded. Cannot start game." }, { quoted: msg });
    }

    // Initialize Session
    chainSessions[chatId] = {
        state: 'joining',
        players: [],
        playerNames: {},
        turnIndex: 0,
        usedWords: [],
        turnTimer: null,
        roundCount: 1,
        currentTurnTimeLimit: 60, // Start with 60s
        currentMinWordLength: 3, 
        lastLetter: '',
        lastActivityTime: Date.now()
    };

    let timeLeftSeconds = JOIN_TIME_MS / 1000;

    await AlexaInc.sendMessage(chatId, { 
        text: `📢 *Word Chain Training!* 📢\n\n` +
              `You have *${timeLeftSeconds} seconds* to join!\n` +
              `Type \`/joinchain\` to enter.` 
    });

    // Join Timer Interval
    const joinInterval = setInterval(async () => {
        timeLeftSeconds -= 15;
        const game = chainSessions[chatId];

        // Safety: If game killed manually
        if (!game || game.state !== 'joining') {
            clearInterval(joinInterval);
            return;
        }

        if (timeLeftSeconds > 0) {
            await AlexaInc.sendMessage(chatId, { text: `⏳ *${timeLeftSeconds} seconds* left to join!` });
        } else {
            // TIME IS UP
            clearInterval(joinInterval);

            if (game.players.length >= 2) {
                game.state = 'playing';
                const alphabet = "abcdefghijklmnopqrstuvwxyz";
                game.lastLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
                
                // Shuffle players
                game.players.sort(() => Math.random() - 0.5);

                const playerList = game.players.map(id => game.playerNames[id]).join(', ');
                await AlexaInc.sendMessage(chatId, { 
                    text: `🔔 *Lobby Closed! Game Starting!* 🔔\nPlayers: ${playerList}` 
                });
                
                startChainTurn(chatId, AlexaInc);
            } else {
                await AlexaInc.sendMessage(chatId, { text: "❌ Not enough players (Min 2). Game cancelled." });
                delete chainSessions[chatId];
            }
        }
    }, 15000); // Update every 15s
}

async function handleJoinChain(msg, AlexaInc) {
    const chatId = msg.key.remoteJid;
    const userId = msg.key.participant || msg.sender;
    const username = msg.pushName || 'Player';
    const game = chainSessions[chatId];
    
    if (game && game.state === 'joining') {
        if (!game.players.includes(userId)) {
            game.players.push(userId);
            game.playerNames[userId] = username;
            return AlexaInc.sendMessage(chatId, { text: `✅ *${username}* joined!` }, { quoted: msg });
        } else {
            return AlexaInc.sendMessage(chatId, { text: `You are already in!` }, { quoted: msg });
        }
    }
}

async function handleStopChain(msg, AlexaInc) {
    const chatId = msg.key.remoteJid;
    if (chainSessions[chatId]) {
        const game = chainSessions[chatId];
        if (game.turnTimer) clearTimeout(game.turnTimer);
        delete chainSessions[chatId];
        return AlexaInc.sendMessage(chatId, { text: "🛑 Word Chain game stopped manually." }, { quoted: msg });
    }
}

// --- 6. GUESS HANDLER (Called from main file) ---

async function handleChainGuess(msg, AlexaInc, text) {
    const chatId = msg.key.remoteJid;
    const userId = msg.key.participant || msg.sender;
    const game = chainSessions[chatId];

    // Basic Validation
    if (!game || game.state !== 'playing') return;
    
    // Check if it's user's turn
    const currentPlayer = game.players[game.turnIndex];
    if (userId !== currentPlayer) return; // Ignore messages from others

    // Game Logic Validation
    if (text.length < game.currentMinWordLength) {
        return AlexaInc.sendMessage(chatId, { text: `⚠️ Too short! Need ${game.currentMinWordLength}+ letters.` }, { quoted: msg });
    }
    if (text.charAt(0) !== game.lastLetter) {
        return AlexaInc.sendMessage(chatId, { text: `❌ Must start with *${game.lastLetter.toUpperCase()}*` }, { quoted: msg });
    }
    if (!chainDictionary.includes(text)) {
        return AlexaInc.sendMessage(chatId, { text: `📖 Not in dictionary!` }, { quoted: msg });
    }
    if (game.usedWords.includes(text)) {
        return AlexaInc.sendMessage(chatId, { text: `♻️ Already used!` }, { quoted: msg });
    }

    // --- VALID MOVE ---
    if (game.turnTimer) clearTimeout(game.turnTimer);
    
    game.usedWords.push(text);
    game.lastLetter = text.slice(-1); // Last letter becomes new requirement
    game.turnIndex++; 
    game.lastActivityTime = Date.now();

    // Proceed to next turn
    startChainTurn(chatId, AlexaInc);
}

// --- 7. CLEANUP TASK ---
function checkInactiveChainGames(AlexaInc) {
    const now = Date.now();
    for (const id in chainSessions) {
        if (now - chainSessions[id].lastActivityTime > INACTIVITY_MS) {
            if (chainSessions[id].turnTimer) clearTimeout(chainSessions[id].turnTimer);
            delete chainSessions[id];
            AlexaInc.sendMessage(id, { text: "💤 Word Chain game closed due to inactivity." });
        }
    }
}

// --- EXPORTS ---
module.exports = {
    handleStartChain,
    handleJoinChain,
    handleStopChain,
    handleChainGuess,
    checkInactiveChainGames
};