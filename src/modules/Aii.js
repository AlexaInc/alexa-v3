/**
 * src/modules/Aii.js  (or callai.js — whichever your bot requires)
 * ---------------------------------------------------------------------------
 * Alexa's AI layer, now powered by the `alexa-ai` package (DeepAI + PostgreSQL)
 * instead of the Hugging Face Gradio Space.
 *
 * DROP-IN COMPATIBLE: the exported function keeps the exact same signature as
 * the old Gradio version, so no call site in the bot has to change:
 *
 *     ai(message, userId, groupId, userName, callback)
 *
 *   • `message` may be a string OR { text: "...", files: [...] }
 *   • `userId`  is the sender jid  ('78151912841263@lid', '947...@s.whatsapp.net')
 *   • `groupId` is the group jid   ('120363413125431525@g.us') or "" for a DM
 *   • `userName` is the WhatsApp push name
 *   • `callback(err, reply)` is optional; the function also returns the reply
 *
 * WHAT YOU GAIN OVER THE OLD VERSION
 *   • No Hugging Face Space to keep warm (no cold starts, no ZeroGPU quota).
 *   • Real long-term memory in PostgreSQL: the same person is recognised in
 *     DMs and in every group.
 *   • The 4 strict triggers (weather/menu/ping/doc) are guaranteed byte-exact.
 *   • WhatsApp formatting is enforced (never ** or #).
 *
 * REQUIRED .env
 *   DEEPAI_API_KEY=tryit-6809613270-caa24a28a55047b221b1123dd19c696a
 *   POSTGRES_URL=postgres://user:pass@host:5432/dbname
 * ---------------------------------------------------------------------------
 */

const config = require("../config");
const AlexaAI = require("alexa-ai");

/** Singleton engine — one PostgreSQL pool for the whole bot. */
let engine = null;

/** Create (once) and return the AI engine. */
function getEngine() {
  if (engine) return engine;

  const key = config.DEEPAI_API_KEY || process.env.DEEPAI_API_KEY;
  const postgresUrl =
    config.POSTGRES_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const model = config.CHAT_MODEL;

  if (!key) throw new Error("DEEPAI_API_KEY is missing from .env");
  if (!postgresUrl) throw new Error("POSTGRES_URL is missing from .env");

  engine = new AlexaAI({
    key,
    postgresUrl,

    // --- tuning (all optional) ---------------------------------------------
    model: model ? model : "gpt-4o-mini", // free-tier DeepAI model
    historyLimit: 14, // past messages replayed to the model
    maxMemories: 25, // facts injected per request
    sharedGroupThread: false, // false = each member has their own thread
    timeout: 60000,
    maxRetries: 2,
    autoMigrate: true, // create tables on first run
    debug: false,
  });

  console.log("✅ Alexa AI engine ready (DeepAI + PostgreSQL)");
  return engine;
}

/**
 * Main AI function — same signature as the old Gradio implementation.
 *
 * @param {string|{text:string, files:Array}} message
 * @param {string} userId    e.g. '78151912841263@lid'
 * @param {string} [groupId] e.g. '120363413125431525@g.us' ("" for DM)
 * @param {string} [userName]
 * @param {function} [callback] (err, reply)
 * @returns {Promise<string>} the reply text
 */
async function ai(message, userId, groupId = "", userName = "User", callback) {
  try {
    const client = getEngine();

    // --- normalise the message shape (string OR { text, files }) -----------
    let text = "";
    let image = null;

    if (typeof message === "string") {
      text = message;
    } else if (typeof message === "object" && message !== null) {
      text = message.text || "";

      const file = Array.isArray(message.files) ? message.files[0] : null;
      if (file) {
        console.log(file);
        if (Buffer.isBuffer(file)) {
          image = { buffer: file, mimetype: "image/jpeg" };
        } else if (typeof file === "string") {
          // a URL or a local path
          image = /^https?:\/\//i.test(file) ? { url: file } : { path: file };
        } else if (typeof file === "object") {
          image = file; // { buffer, mimetype, filename }
        }
      }
    }

    // --- ask Alexa ----------------------------------------------------------
    const result = await client.chat({
      message: text,
      userId: String(userId || "default_user"),
      groupId: groupId ? String(groupId) : null,
      userName: String(userName || "User"),
      image: image,
    });

    const reply = result.text || "";

    if (typeof callback === "function") callback(null, reply);
    return reply;
  } catch (err) {
    console.error("❌ Error in Alexa AI call:", err.message);
    if (typeof callback === "function") callback(err.message, null);
    return "";
  }
}

// ---------------------------------------------------------------------------
//  Extras — handy for bot commands. Ignore them if you don't need them.
// ---------------------------------------------------------------------------

/** `.forget` command — wipe everything Alexa remembers about a user. */
ai.forgetUser = async (userId) => getEngine().forgetAll(userId);

/** `.memory` command — show what Alexa remembers. */
ai.getMemories = async (userId) => getEngine().getMemories(userId);

/** `.reset` command — clear the chat transcript (memories are kept). */
ai.clearHistory = async (userId, groupId = null) =>
  getEngine().clearHistory(userId, groupId || null);

/** Block / unblock a user from using the AI. */
ai.blockUser = async (userId) => getEngine().blockUser(userId);
ai.unblockUser = async (userId) => getEngine().unblockUser(userId);

/** Turn Alexa on/off inside one group. */
ai.setGroupEnabled = async (groupId, enabled) =>
  getEngine().setGroupEnabled(groupId, enabled);

/** Full profile: user row + memories + threads. */
ai.getProfile = async (userId) => getEngine().getProfile(userId);

/** Engine stats for the dashboard. */
ai.stats = async () => getEngine().stats();

/** Health probe. */
ai.health = async () => getEngine().health();

/** Close the PostgreSQL pool on shutdown. */
ai.close = async () => {
  if (engine) {
    await engine.close();
    engine = null;
  }
};

module.exports = ai;
