const axios = require('axios');
const FormData = require('form-data');
const mysql = require('mysql2');

// --- API Configuration ---
const API_URL = 'https://api.deepai.org/hacking_is_a_serious_crime';
const API_KEY = 'tryit-84439558844-162c0c5e2e8dc7aa5d86d15a2a8df781';

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
 * Main function to call AI with MySQL history management.
 * @param {object} db - MySQL connection/pool
 * @param {string} thread_id_name - Name of the user
 * @param {string} message - User message (string or object for multimodal)
 * @param {string} thread_id - Unique ID for the conversation (WhatsApp JID/LID)
 * @param {function} callback - Callback (err, reply)
 */
async function ai(db, thread_id_name, message, thread_id, callback) {
    const query1 = 'SELECT `conventions` FROM `conversation_history` WHERE `id` = ?';

    db.execute(query1, [thread_id], async (err, results) => {
        if (err) {
            console.error('Error fetching conversations:', err);
            return callback('Database error', null);
        }

        let conversations = [];
        if (results.length > 0) {
            try {
                const abc = results[0].conventions;
                if (typeof abc === 'string') {
                    conversations = JSON.parse(abc);
                } else if (Array.isArray(abc)) {
                    conversations = abc || [];
                }
            } catch (e) {
                console.error('Error parsing conventions data:', e);
            }
        }

        // Add user message
        const newUserMessage = { role: 'user', content: message };
        conversations.push(newUserMessage);

        // Keep last 12 messages for context
        let historyForApi = conversations.length > 12 ? conversations.slice(-12) : [...conversations];

        // Prepare full prompt with dynamic name in system header if needed
        const systemHeader = [...DEFAULT_SYSTEM];
        systemHeader[0].content += `\n\n users name is always ${thread_id_name}. until user say its not his/her name`;

        const apiHistory = [...systemHeader, ...historyForApi];

        const form = new FormData();
        form.append('chat_style', 'chat');
        form.append('chatHistory', JSON.stringify(apiHistory));
        form.append('model', 'gemini-2.5-flash-lite');
        form.append('hacker_is_stinky', 'very_stinky');
        form.append('enabled_tools', JSON.stringify(["image_generator"]));

        const headers = { 'api-key': API_KEY, ...form.getHeaders() };

        try {
            const resp = await axios.post(API_URL, form, { headers, timeout: 20000 });
            let originalReply = parseApiResponse(resp);

            // Apply denial fixes
            const userText = typeof message === 'string' ? message : (Array.isArray(message) ? message.find(m => m.type === 'text')?.text || '' : '');
            let finalReply = fixBotDenials(originalReply, userText);

            const newAssistantMessage = { role: 'assistant', content: finalReply };
            conversations.push(newAssistantMessage);

            const pushed = JSON.stringify(conversations);

            if (results.length > 0) {
                const query2 = 'UPDATE `conversation_history` SET `conventions` = ? WHERE `id` = ?';
                db.execute(query2, [pushed, thread_id], (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating conversation:', updateErr);
                        return callback('Error updating conversation', null);
                    }
                    callback(null, finalReply);
                });
            } else {
                const query3 = 'INSERT INTO `conversation_history`(`id`, `conventions`) VALUES (?, ?)';
                db.execute(query3, [thread_id, pushed], (insertErr) => {
                    if (insertErr) {
                        console.error('Error inserting conversation:', insertErr);
                        return callback('Error inserting conversation', null);
                    }
                    callback(null, finalReply);
                });
            }

        } catch (apiErr) {
            console.error("❌ Error calling AI API:", apiErr.message);
            callback(apiErr.message, null);
        }
    });
}

module.exports = ai;
