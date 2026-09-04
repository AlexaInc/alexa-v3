// Dynamic import supporting both CommonJS and ES Modules
let clientInstance = null;

async function getGradioClient() {
    if (!clientInstance) {
        const {Client} = await import('@gradio/client');
        clientInstance = await Client.connect("hansaka01/aiforalexa");
        console.log("✅ Connected to Hugging Face ZeroGPU Space");
    }
    return clientInstance;
}

/**
 * Main AI function to send messages to Hugging Face Space
 * @param {string|object} message - Message string or { text: "", files: [] }
 * @param {string} userId - User WhatsApp JID (e.g. '94771234567@s.whatsapp.net')
 * @param {string} groupId - Group WhatsApp JID if in group chat, else ''
 * @param {string} userName - Name of the user sending the message
 * @param {function} callback - Callback function (err, reply)
 */
async function ai(message, userId, groupId = "", userName = "User", callback) {
    try {
        const client = await getGradioClient();

        // Format message object for Gradio Multimodal input
        let formattedMessage = {text: "", files: []};
        if (typeof message === 'string') {
            formattedMessage.text = message;
        } else if (typeof message === 'object' && message !== null) {
            formattedMessage.text = message.text || "";
            formattedMessage.files = message.files || [];
        }

        // Call the Hugging Face Space prediction endpoint
        const result = await client.predict("/chat_function", {
            message: formattedMessage,
            user_id: String(userId || "default_user"),
            group_id: String(groupId || ""),
            user_name: String(userName || "User")
        });

        // Extract the reply string
        let reply = "";
        if (Array.isArray(result.data)) {
            reply = result.data[0];
        } else if (typeof result.data === 'string') {
            reply = result.data;
        } else {
            reply = JSON.stringify(result.data);
        }

        if (typeof callback === 'function') {
            callback(null, reply);
        }
        return reply;

    } catch (err) {
        console.error("❌ Error in HF Gradio AI Call:", err.message);
        // Reset client on failure so it reconnects on next attempt
        clientInstance = null;

        if (typeof callback === 'function') {
            callback(err.message, null);
        }
    }
}

module.exports = ai;