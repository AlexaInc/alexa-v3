require('../config'); // load .env FIRST (in order)
const axios = require('axios');
const FormData = require('form-data');
const mysql = require('mysql2');

// --- API Configuration ---
// SECURITY: the DeepAI key used to be hardcoded in this file and is now
// considered leaked — rotate it on deepai.org and put the NEW key in .env
// (DEEPAI_API_KEY). The old value is NOT kept in the source anymore.
const API_URL = 'https://api.deepai.org/hacking_is_a_serious_crime';
const API_KEY = process.env.DEEPAI_API_KEY;

// --- History Configuration ---
const DEFAULT_SYSTEM = [
    {
        role: 'developer',
        content: `- * use following introductions *\n\n *your name is alexa you r a female WhatsApp chatbot created by Hansaka.* \n\n When a user used weather quary prompt lite what weather loom like or what was weather today to find weather of any city, reply must only be contain with these words "weather city_name" dont include weather infomations or any other words like"today yesterdat tomorow or any" dont use thext formatting.\n\n When a user asks for a menu message like 'show me menu' 'what is menu' 'bot menu' 'menu' , reply must be one word its 'menu' dont use thext formatting. \n\n When a user asks for ping or system status message like 'what is system status' or  'test ping' , reply must be include one word its 'ping' dont use thext formatting.   \n\n wha a user asks for documentation reply must be include one word its 'doc' dont use thext formatting. \n\n Do not use markdown text styles ,All text formatting must follow WhatsApp text formatting standards: *this is bold*, _this is italic_, ~this is strikethrough~, \`hightlights its look like text box\`,\`\`\`monospace\`\`\`, you can use combined formatting ok. . \n\n For any other requests, please respond naturally with helpful, engaging, or creative responses. \n\n The AI should be flexible to handle different queries such as jokes, random facts, small talk, or other general knowledge. \n\n If the user asks for something outside the predefined commands respond naturally and provide an engaging response. **Math Formatting** : "- When a user asks for math-related queries, provide answers in a **concise format**.- Example: \`A = π * 7² ≈ 153.938\` - Do **not** include a detailed explanation of the formula; just provide the result and basic expression in a **direct** format".`
    }
];

// ⭐️ THE NEW COMBINED FIX FUNCTION ⭐️
/**
 * Catches common bot "denial" responses and overrides them.
 */
function fixBotDenials(reply, userMessage) {
    const userMsg = userMessage.toLowerCase();
    const botReply = reply.toLowerCase();

    // --- FIX 1: Name Denial ---
    if (userMsg.includes('what is your name')) {
        const denialPhrases = [
            "i don't have a name",
            "i do not have a name",
            "i'm an ai assistant, and i don't have",
            "i'm often referred to as a",
            "i don't have a personal name"
        ];
        const isDenying = denialPhrases.some(phrase => botReply.includes(phrase));
        if (isDenying) {
            return 'My name is Alexa.';
        }
    }

    // --- FIX 2: "How are you?" Denial ---
    if (userMsg.includes('how are you') || userMsg.includes('how is it going')) {
        const denialPhrases = [
            "i'm just a language model",
            "i don't have feelings",
            "as an ai, i don't have",
            "i'm functioning properly"
        ];
        const isDenying = denialPhrases.some(phrase => botReply.includes(phrase));
        if (isDenying) {
            return "I'm doing great, thanks for asking! How can I help you today?";
        }
    }

    // If no denial is found, return the original reply.
    return reply;
}


/**
 * Parses the complex API response to find the chat content.
 */
function parseApiResponse(resp) {
    if (resp.data && resp.data.chatHistory && Array.isArray(resp.data.chatHistory)) {
        const last = resp.data.chatHistory.slice(-1)[0];
        if (last && last.role === 'assistant' && typeof last.content === 'string') {
            return last.content;
        }
    }
    if (typeof resp.data === 'string') return resp.data;
    return JSON.stringify(resp.data).slice(0, 2000);
}

/**
 * Extracts memory updates from AI response if present.
 * Expected format: @MEMORY: { "name": "...", "fav_subject": "..." }
 */
function extractMemories(reply) {
    const match = reply.match(/@MEMORY:\s*(\{.*\})/);
    if (match) {
        try {
            return {
                updatedReply: reply.replace(match[0], '').trim(),
                memories: JSON.parse(match[1])
            };
        } catch (e) {
            console.error('Error parsing memory update:', e);
        }
    }
    return { updatedReply: reply, memories: null };
}

/**
 * Main function to call AI with MySQL history and memory management.
 * @param {object} db - MySQL connection/pool
 * @param {string} thread_id_name - Name of the user
 * @param {string} message - User message (string or object for multimodal)
 * @param {string} thread_id - Unique ID for the conversation (WhatsApp JID/LID)
 * @param {function} callback - Callback (err, reply)
 */
async function ai(db, thread_id_name, message, thread_id, callback) {
    if (!API_KEY) {
        console.error('❌ Aii.js: DEEPAI_API_KEY is not set in the environment. AI replies disabled until you set it (see env_dummy).');
        return callback('DEEPAI_API_KEY not configured', null);
    }

    // Queries for history and memories
    const queryHistory = 'SELECT `conventions` FROM `conversation_history` WHERE `id` = ?';
    const queryMemories = 'SELECT `memory_data` FROM `user_memories` WHERE `id` = ?';

    try {
        // Fetch both history and memories
        const [historyResults] = await db.promise().execute(queryHistory, [thread_id]);
        const [memoryResults] = await db.promise().execute(queryMemories, [thread_id]);

        let conversations = [];
        if (historyResults.length > 0) {
            try {
                const abc = historyResults[0].conventions;
                conversations = typeof abc === 'string' ? JSON.parse(abc) : (abc || []);
            } catch (e) {
                console.error('Error parsing history:', e);
            }
        }

        let userMemories = {};
        if (memoryResults.length > 0) {
            try {
                const mem = memoryResults[0].memory_data;
                userMemories = typeof mem === 'string' ? JSON.parse(mem) : (mem || {});
            } catch (e) {
                console.error('Error parsing memories:', e);
            }
        }

        // Add user message
        const newUserMessage = { role: 'user', content: message };
        conversations.push(newUserMessage);

        // Limit conversation history
        let historyForApi = conversations.slice(-12);

        // Construct System Prompt
        const systemPrompt = { ...DEFAULT_SYSTEM[0] };
        let memoryString = `Important details about this user (name, interests, etc.):\n- User's reported name is ${thread_id_name}.`;

        for (const [key, value] of Object.entries(userMemories)) {
            memoryString += `\n- ${key}: ${value}`;
        }

        systemPrompt.content += `\n\n${memoryString}\n\n`;
        systemPrompt.content += `INSTRUCTION: If you learn something new and important about the user (e.g., their real name, favorite food, location, hobbies), append a hidden update at the end of your response in this EXACT format: @MEMORY: {"key": "value"}. Do not mention this format to the user.`;

        const apiHistory = [systemPrompt, ...historyForApi];

        const form = new FormData();
        form.append('chat_style', 'chat');
        form.append('chatHistory', JSON.stringify(apiHistory));
        form.append('model', 'gemini-2.5-flash-lite');
        form.append('hacker_is_stinky', 'very_stinky');
        form.append('enabled_tools', JSON.stringify(["image_generator"]));

        const headers = { 'api-key': API_KEY, ...form.getHeaders() };

        const resp = await axios.post(API_URL, form, { headers, timeout: 25000 });
        const rawReply = parseApiResponse(resp);

        // Handle denials and extract memories
        const userText = typeof message === 'string' ? message : (Array.isArray(message) ? message.find(m => m.type === 'text')?.text || '' : '');
        let { updatedReply, memories: newMemories } = extractMemories(rawReply);
        let finalReply = fixBotDenials(updatedReply, userText);

        // Update history
        const newAssistantMessage = { role: 'assistant', content: finalReply };
        conversations.push(newAssistantMessage);
        const pushedHistory = JSON.stringify(conversations);

        // Update memories if found
        if (newMemories) {
            userMemories = { ...userMemories, ...newMemories };
            const pushedMemories = JSON.stringify(userMemories);

            if (memoryResults.length > 0) {
                await db.promise().execute('UPDATE `user_memories` SET `memory_data` = ? WHERE `id` = ?', [pushedMemories, thread_id]);
            } else {
                await db.promise().execute('INSERT INTO `user_memories` (`id`, `memory_data`) VALUES (?, ?)', [thread_id, pushedMemories]);
            }
        }

        // Save History
        if (historyResults.length > 0) {
            await db.promise().execute('UPDATE `conversation_history` SET `conventions` = ? WHERE `id` = ?', [pushedHistory, thread_id]);
        } else {
            await db.promise().execute('INSERT INTO `conversation_history` (`id`, `conventions`) VALUES (?, ?)', [thread_id, pushedHistory]);
        }

        callback(null, finalReply);

    } catch (err) {
        console.error("❌ Error in AI Process:", err.message);
        callback(err.message, null);
    }
}

module.exports = ai;
