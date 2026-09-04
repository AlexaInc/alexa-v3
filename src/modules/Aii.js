// Dynamic import supporting both CommonJS and ES Modules
let clientInstance = null;
require("../config");
async function getGradioClient() {
  if (!clientInstance) {
    const { Client } = await import("@gradio/client");
    const hfToken = process.env["HF_TOKEN"]; // .env එකෙන් Token එක ගන්නවා
    console.log(
      "🔑 HF Token Status:",
      hfToken ? "Loaded successfully" : "❌ NOT FOUND IN .ENV",
    );
    clientInstance = await Client.connect("hansaka01/aiforalexa", {
      token: hfToken,
    });
    console.log("✅ Connected to Hugging Face ZeroGPU Space with Token");
  }
  return clientInstance;
}

/**
 * Main AI function to send messages to Hugging Face Space
 */
async function ai(message, userId, groupId = "", userName = "User", callback) {
  try {
    const client = await getGradioClient();

    const formattedMessage = { text: "", files: [] };
    if (typeof message === "string") {
      formattedMessage.text = message;
    } else if (typeof message === "object" && message !== null) {
      formattedMessage.text = message.text || "";
      formattedMessage.files = message.files || [];
    }

    const result = await client.predict("/chat_function", {
      message: formattedMessage,
      user_id: String(userId || "default_user"),
      group_id: String(groupId || ""),
      user_name: String(userName || "User"),
    });

    let reply = "";
    if (Array.isArray(result.data)) {
      reply = result.data[0];
    } else if (typeof result.data === "string") {
      reply = result.data;
    } else {
      reply = JSON.stringify(result.data);
    }

    if (typeof callback === "function") {
      callback(null, reply);
    }
    return reply;
  } catch (err) {
    console.error("❌ Error in HF Gradio AI Call:", err.message);
    clientInstance = null; // Error එකක් ආවොත් Reconnect වීමට Reset කරයි

    if (typeof callback === "function") {
      callback(err.message, null);
    }
  }
}

module.exports = ai;
