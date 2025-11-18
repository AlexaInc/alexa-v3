const fs = require('fs');

// --- 1. CONFIGURATION & CONSTANTS ---
// (You can change these values)

const LEADERBOARD_FILE = './leaderboard.json'; // Path to save scores
const FILE_PATH = './words.txt';              // Path to your word list
const MAX_WRONG_GUESSES = 6;                  // Max body parts
const MAX_PLAYERS = 10;                       // Max players per game
const INACTIVITY_TIMEOUT_MS = 1000 * 60 * 5;  // 5 minutes

// --- 2. GLOBAL VARIABLES ---

let leaderboard = {}; // Will be loaded from LEADERBOARD_FILE
let wordList = [];    // Will be loaded from FILE_PATH
const gameSessions = {}; // Stores active games by chatId

// --- 3. UNCHANGED LOGIC (File I/O & Core Rules) ---

/**
 * Loads the leaderboard from a JSON file.
 */
function loadLeaderboard() {
    try {
        if (fs.existsSync(LEADERBOARD_FILE)) {
            const fileContent = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
            leaderboard = JSON.parse(fileContent);
            console.log('Hangman: Leaderboard loaded successfully.');
        } else {
            console.log('Hangman: No leaderboard file found, starting new one.');
            leaderboard = {};
        }
    } catch (err) {
        console.error('Hangman: Error loading leaderboard:', err);
        leaderboard = {}; // Start fresh if the file is corrupt
    }
}

/**
 * Saves the current leaderboard back to the JSON file.
 */
function saveLeaderboard() {
    try {
        const fileContent = JSON.stringify(leaderboard, null, 2); // Pretty-print JSON
        fs.writeFileSync(LEADERBOARD_FILE, fileContent, 'utf8');
    } catch (err) {
        console.error('Hangman: Error saving leaderboard:', err);
    }
}

/**
 * Calculates points for an individual player at the end of a winning game.
 * 10 points per correct letter they guessed + 5 points per life left.
 */
function calculatePlayerPoints(player) {
    const correctGuessCount = player.myCorrectGuesses.length;
    const livesLeft = MAX_WRONG_GUESSES - player.wrongGuesses;
    
    // Ensure points are positive even if livesLeft is 0
    return (correctGuessCount * 10) + (livesLeft * 5);
}

/**
 * Gets a new random word from the loaded word list.
 */
function getNewWord() {
    const newWord = wordList[Math.floor(Math.random() * wordList.length)];
    console.log(`Hangman: New word selected: ${newWord}`);
    return newWord;
}

/**
 * Generates the " _ _ a _ " display.
 */
function getWordDisplay(word, allGuessedLetters) {
    let display = '';
    for (const char of word) {
        if (/[a-z]/.test(char)) { // Check if it's a letter
            if (allGuessedLetters.includes(char)) {
                display += char + ' ';
            } else {
                display += '_ ';
            }
        } else {
            // It's not a letter (e.g., a hyphen), so always show it
            display += char + ' ';
        }
    }
    return display.trim();
}

/**
 * Returns the ASCII art for the hangman.
 */
function getHangmanDrawing(wrongGuesses) {
    const stages = [
        `\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========\n`, // 0 wrong
        `\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========\n`, // 1 wrong
        `\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========\n`, // 2 wrong
        `\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========\n`, // 3 wrong
        `\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========\n`, // 4 wrong
        `\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========\n`, // 5 wrong
        `\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========\n`  // 6 wrong
    ];
    return stages[Math.min(wrongGuesses, stages.length - 1)];
}


// --- 4. MODIFIED HELPER FUNCTIONS (Baileys Conversion) ---

/**
 * Generates the status text for all players in the game.
 * (MODIFIED for WhatsApp formatting)
 */
function getPlayerStatus(players) {
    let statusText = "\n--- 👤 Player Lives ---\n";
    if (Object.keys(players).length === 0) {
        statusText += "No players have joined yet.\n";
    }
    for (const userId in players) {
        const player = players[userId];
        const livesLeft = MAX_WRONG_GUESSES - player.wrongGuesses;
        const hearts = '❤️'.repeat(livesLeft) + '💀'.repeat(player.wrongGuesses);
        
        // Use *bold* for WhatsApp
        statusText += `*${player.username}*: ${hearts} ${livesLeft === 0 ? ' (Defeated)' : ''}\n`;
    }
    return statusText;
}

/**
 * Checks for inactive games and ends them.
 * (MODIFIED to accept 'AlexaInc' client)
 */
function checkInactiveGames(AlexaInc) {
    const now = Date.now();
    
    for (const chatId in gameSessions) {
        const game = gameSessions[chatId];
        
        if (game && game.state === 'playing' && game.lastActivityTime) {
            const timeSinceLastActivity = now - game.lastActivityTime;
            
            if (timeSinceLastActivity > INACTIVITY_TIMEOUT_MS) {
                console.log(`Hangman: Ending game in chat ${chatId} due to inactivity.`);
                
                const endMessage = `💀 *Game Over!* 💀\n\n` +
                    `This game has ended due to 5 minutes of inactivity.\n` +
                    `The word was: \`\`\`${game.secretWord}\`\`\`\n\n` + // Use ```monospace``` for WhatsApp
                    `Type /newhang to play again.`;
                
                // Use AlexaInc.sendMessage (no 'quoted' message here)
                AlexaInc.sendMessage(chatId, { text: endMessage });
                
                delete gameSessions[chatId];
            }
        }
    }
}


// --- 5. INITIALIZATION LOGIC (File Loading) ---

try {
    const fileContent = fs.readFileSync(FILE_PATH, 'utf8');
    wordList = fileContent
        .split(/\r?\n/) // Splits on both Windows (\r\n) and Unix (\n) newlines
        .map(word => word.trim().toLowerCase()) // Trims whitespace and makes lowercase
        .filter(word => word.length > 0 && /^[a-z]+$/.test(word)); // Removes empty lines and non-alpha words

    if (wordList.length === 0) {
        throw new Error('No valid words (a-z only) found in words.txt');
    }
    console.log(`Hangman: Successfully loaded ${wordList.length} words from ${FILE_PATH}`);

} catch (err) {
    console.error(`Hangman: Error reading ${FILE_PATH}:`, err.message);
    console.error('Please make sure words.txt exists and contains one word per line.');
    process.exit(1); // Stop the bot if file can't be read
}

// Load the leaderboard *after* loading words
loadLeaderboard();


// --- 6. NEW CORE LOGIC (Guess Handling) ---

/**
 * Handles a player's guess (a single letter).
 */
async function handleHangmanGuess(msg, AlexaInc, guess) {
    const chatId = msg.key.remoteJid;
    const userId = msg.key.participant || msg.sender;
    const game = gameSessions[chatId];

    // 1. Check if game is in a valid state
    if (!game || game.state !== 'playing') return; // No game, or not started
    if (!game.players[userId]) return; // Not a player
    if (game.players[userId].wrongGuesses >= MAX_WRONG_GUESSES) return; // Player is already out

    game.lastActivityTime = Date.now(); // Update activity timer

    // 2. Check if letter was already guessed
    if (game.allGuessedLetters.includes(guess)) {
        return AlexaInc.sendMessage(chatId, { text: `The letter \`${guess}\` has already been guessed.` }, { quoted: msg });
    }

    game.allGuessedLetters.push(guess);
    const username = msg.pushName || 'Player';

    // 3. Process the guess (correct or wrong)
    if (game.secretWord.includes(guess)) {
        // --- CORRECT GUESS ---
        game.players[userId].myCorrectGuesses.push(guess);

        const currentDisplay = getWordDisplay(game.secretWord, game.allGuessedLetters);
        
        // Check for WIN
        if (!currentDisplay.includes('_')) {
            let winMessage = `🎉 *${username} guessed the last letter!* 🎉\n\n` +
                             `The word was: \`\`\`${game.secretWord}\`\`\`\n\n` +
                             `*--- 🏆 WINNERS 🏆 ---*\n`;

            let hasWinners = false;
            for (const pId in game.players) {
                const player = game.players[pId];
                if (player.wrongGuesses < MAX_WRONG_GUESSES) { // Only living players win
                    hasWinners = true;
                    const points = calculatePlayerPoints(player);
                    
                    // Update leaderboard
                    if (!leaderboard[pId]) {
                        leaderboard[pId] = { username: player.username, points: 0 };
                    }
                    leaderboard[pId].username = player.username; // Keep username fresh
                    leaderboard[pId].points += points;

                    winMessage += `*${player.username}*: +${points} points (Total: ${leaderboard[pId].points})\n`;
                }
            }
            if (!hasWinners) {
                winMessage += "No players survived to claim the victory.\n";
            }
            
            saveLeaderboard(); // Save scores
            delete gameSessions[chatId]; // End game
            return AlexaInc.sendMessage(chatId, { text: winMessage });
        }
        
        // Game continues, just a correct guess
        const correctMessage = `✅ *Correct!* (${username})\n\n` +
                               `Word: \`\`\`${currentDisplay}\`\`\`\n` +
                               `Guessed: \`[${game.allGuessedLetters.join(', ')}]\`\n` +
                               `${getPlayerStatus(game.players)}`;
        return AlexaInc.sendMessage(chatId, { text: correctMessage });

    } else {
        // --- WRONG GUESS ---
        const player = game.players[userId];
        player.wrongGuesses++;

        const currentDisplay = getWordDisplay(game.secretWord, game.allGuessedLetters);
        let wrongMessage = `❌ *Wrong!* (${username})\n\n` +
                           `\`\`\`${getHangmanDrawing(player.wrongGuesses)}\`\`\`\n` +
                           `Word: \`\`\`${currentDisplay}\`\`\`\n` +
                           `Guessed: \`[${game.allGuessedLetters.join(', ')}]\`\n`;

        if (player.wrongGuesses >= MAX_WRONG_GUESSES) {
            wrongMessage += `\n💀 *${player.username} has been defeated!* 💀\n`;
        }
        
        // Check for LOSS (all players are out)
        const allPlayersOut = Object.values(game.players).every(p => p.wrongGuesses >= MAX_WRONG_GUESSES);

        if (allPlayersOut) {
            wrongMessage += `\n*--- 💀 GAME OVER 💀 ---*\n` +
                            `All players have been defeated!\n` +
                            `The word was: \`\`\`${game.secretWord}\`\`\``;
            delete gameSessions[chatId]; // End game
            return AlexaInc.sendMessage(chatId, { text: wrongMessage });
        }

        // Game continues, just a wrong guess
        wrongMessage += getPlayerStatus(game.players);
        return AlexaInc.sendMessage(chatId, { text: wrongMessage });
    }
}


// --- 7. CONVERTED COMMAND HANDLERS (Baileys) ---

/**
 * Handles the /newhang command
 */
async function handleNewHang(msg, AlexaInc) {
    const chatId = msg.key.remoteJid;

    if (!chatId.endsWith('@g.us')) {
        return AlexaInc.sendMessage(chatId, { text: "This game mode is for groups only. Add me to a group to start a game." }, { quoted: msg });
    }
    if (gameSessions[chatId]) {
        return AlexaInc.sendMessage(chatId, { text: "A game is already running. Type /joinhang to join it, or /endhang to stop it." }, { quoted: msg });
    }

    gameSessions[chatId] = {
        secretWord: getNewWord(),
        allGuessedLetters: [],
        state: 'joining',
        creatorId: msg.key.participant || msg.sender,
        players: {},
        lastActivityTime: null
    };

    const creatorName = msg.pushName || 'The creator';
    const startMessage = `🎉 *New Hangman Game Started!* 🎉\n\n` +
        `Players can now type \`/joinhang\` to enter (Max ${MAX_PLAYERS}).\n\n` +
        `The creator (${creatorName}) can type \`/starthang\` to begin.`;

    return AlexaInc.sendMessage(chatId, { text: startMessage }, { quoted: msg });
}

/**
 * Handles the /joinhang command
 */
async function handleJoinHang(msg, AlexaInc) {
    const chatId = msg.key.remoteJid;
    const userId = msg.key.participant || msg.sender;
    const username = msg.pushName || 'Player';
    const game = gameSessions[chatId];

    if (!game) {
        return AlexaInc.sendMessage(chatId, { text: "No game is active. Start one with /newhang." }, { quoted: msg });
    }
    if (game.state !== 'joining') {
        return AlexaIns.sendMessage(chatId, { text: "This game is already in progress. Wait for the next one!" }, { quoted: msg });
    }
    if (game.players[userId]) {
        return AlexaInc.sendMessage(chatId, { text: "You've already joined this game." }, { quoted: msg });
    }
    if (Object.keys(game.players).length >= MAX_PLAYERS) {
        return AlexaInc.sendMessage(chatId, { text: `The game is full! (Max ${MAX_PLAYERS} players).` }, { quoted: msg });
    }

    game.players[userId] = {
        username: username,
        wrongGuesses: 0,
        myCorrectGuesses: []
    };

    const joinMessage = `✅ *${username}* has joined the game! (${Object.keys(game.players).length}/${MAX_PLAYERS} players)`;
    return AlexaInc.sendMessage(chatId, { text: joinMessage }, { quoted: msg });
}

/**
 * Handles the /starthang command
 */
async function handleStartHang(msg, AlexaInc) {
    const chatId = msg.key.remoteJid;
    const game = gameSessions[chatId];

    if (!game) {
        return AlexaInc.sendMessage(chatId, { text: "No game to start. Start one with /newhang." }, { quoted: msg });
    }
    if (game.state === 'playing') {
        return AlexaInc.sendMessage(chatId, { text: "The game is already in progress!" }, { quoted: msg });
    }
    if (Object.keys(game.players).length === 0) {
        return AlexaInc.sendMessage(chatId, { text: "Cannot start the game with no players. Type /joinhang to play." }, { quoted: msg });
    }

    game.state = 'playing';
    game.lastActivityTime = Date.now();

    const gameStartMessage = `▶️ *The game has started!* \n\n` +
        `Guess letters by typing them one by one (e.g., \`a\`, \`b\`...)\n\n` +
        `Word: \`\`\`${getWordDisplay(game.secretWord, game.allGuessedLetters)}\`\`\`\n` +
        `Guessed: \`[none]\`\n` +
        `${getPlayerStatus(game.players)}`;

    return AlexaInc.sendMessage(chatId, { text: gameStartMessage }, { quoted: msg });
}

/**
 * Handles the /endhang command
 */
async function handleEndHang(msg, AlexaInc) {
    const chatId = msg.key.remoteJid;
    if (gameSessions[chatId]) {
        delete gameSessions[chatId];
        return AlexaInc.sendMessage(chatId, { text: "Game stopped. Start a new one with /newhang." }, { quoted: msg });
    } else {
        return AlexaInc.sendMessage(chatId, { text: "No active game to end." }, { quoted: msg });
    }
}

/**
 * Handles the /hanglead command
 */
async function handleHangLead(msg, AlexaInc) {
    const chatId = msg.key.remoteJid;
    
    // Use Object.entries to get [jid, playerInfo] pairs
    const allPlayerData = Object.entries(leaderboard);

    if (allPlayerData.length === 0) {
        return AlexaInc.sendMessage(chatId, { text: "The leaderboard is empty. Be the first to win!" }, { quoted: msg });
    }

    // Sort by points (b[1].points - a[1].points)
    // a[0] is the jid, a[1] is the {username, points} object
    allPlayerData.sort((a, b) => b[1].points - a[1].points);
    
    const top10 = allPlayerData.slice(0, 10);

    let leaderBoardMessage = "🏆 *Hangman Leaderboard (Top 10)* 🏆\n\n";
    let mentions = []; // <-- Array to hold the JIDs

    top10.forEach(([jid, player], index) => {
        let medal = '';
        if (index === 0) medal = '🥇';
        else if (index === 1) medal = '🥈';
        else if (index === 2) medal = '🥉';
        
        // 1. Create the text part of the mention (e.g., @1234567890)
        leaderBoardMessage += `${medal} ${index + 1}. @${jid.split('@')[0]} - ${player.points} points\n`;
        
        // 2. Add the full JID to the mentions array
        mentions.push(jid);
    });

    // 3. Send the message with both text and the mentions array
    return AlexaInc.sendMessage(
        chatId, 
        { 
            text: leaderBoardMessage, 
            mentions: mentions // <-- Add the mentions array here
        }, 
        { quoted: msg }
    );
}


// --- 8. MAIN HANDLER & EXPORTS ---

/**
 * Main router for all hangman commands.
 * Call this from your main `messages.upsert` handler.
 * * @param {object} msg - The Baileys message object.
 * @param {object} AlexaInc - Your Baileys client object.
 * @param {string} command - The processed command or guess.
 */
async function handleHangman(msg, AlexaInc, command) {
    switch (command) {
        case '/newhang':
            await handleNewHang(msg, AlexaInc);
            break;
        case '/joinhang':
            await handleJoinHang(msg, AlexaInc);
            break;
        case '/starthang':
            await handleStartHang(msg, AlexaInc);
            break;
        case '/endhang':
            await handleEndHang(msg, AlexaInc);
            break;
        case '/hanglead':
            await handleHangLead(msg, AlexaInc);
            break;
        case '.newhang':
            await handleNewHang(msg, AlexaInc);
            break;
        case '.joinhang':
            await handleJoinHang(msg, AlexaInc);
            break;
        case '.starthang':
            await handleStartHang(msg, AlexaInc);
            break;
        case '.endhang':
            await handleEndHang(msg, AlexaInc);
            break;
        case '.hanglead':
            await handleHangLead(msg, AlexaInc);
            break;
        default:
            // Check if it's a single-letter guess
            if (command.length === 1 && /[a-z]/.test(command)) {
                await handleHangmanGuess(msg, AlexaInc, command);
            }
            break;
    }
}

// Export the functions your main file will need
module.exports = {
    handleHangman,
    checkInactiveGames
};