/**
 * src/modules/Aii.js  (or callai.js — whichever your bot requires)
 * ---------------------------------------------------------------------------
 * Alexa's AI layer, powered by the `alexa-ai` package (DeepAI + PostgreSQL)
 * instead of the Hugging Face Gradio Space.
 *
 * DROP-IN COMPATIBLE: the exported function keeps the exact same signature as
 * the old Gradio version, so no call site in the bot has to change:
 *
 *     ai(message, userId, groupId, userName, callback)
 *
 *   • `message` may be a string OR { text: "...", files: [...] }
 *   • `userId`  is the sender jid  ('78151912841263@lid', '947...@s.whatsapp.net')
 *               …or, better, everything you know: see IDENTITY below
 *   • `groupId` is the group jid   ('120363413125431525@g.us') or "" for a DM
 *   • `userName` is the WhatsApp push name
 *   • `callback(err, reply)` is optional; the function also returns the reply
 *
 * THE PERSONA
 *   This module deliberately does NOT pass `systemPrompt`, `assistantName` or
 *   `creator`. The engine's DEFAULT system prompt is used — the full Alexa
 *   persona (identity rules, WhatsApp formatting, the 4 strict triggers, math
 *   rules, vision rules, @MEMORY tracking). Overriding it here would silently
 *   disable those guarantees, so don't, unless you really mean to.
 *
 * IDENTITY — read this once, it is the important bit
 *   WhatsApp calls the same human by two different addresses:
 *
 *       DM     ->  94771234567@s.whatsapp.net      (phone jid)
 *       GROUP  ->  78151912841263@lid              (privacy / LID jid)
 *
 *   If the bot only ever passes one of them, the engine sees two people and
 *   Alexa "forgets" the user the moment they speak in a group. Baileys hands
 *   you both on every group message, so pass both:
 *
 *       const sender    = msg.key.participant || msg.key.remoteJid;
 *       const senderAlt = msg.key.participantAlt || msg.key.participantPn;
 *
 *       await ai(text, { id: sender, phone: senderAlt }, groupId, pushName);
 *       // or simply:  await ai.fromMessage(msg, sock);
 *
 *   Plain strings still work exactly as before — you just don't get the
 *   cross-chat recognition until you supply the second address.
 *
 * WHAT YOU GAIN OVER THE OLD VERSION
 *   • No Hugging Face Space to keep warm (no cold starts, no ZeroGPU quota).
 *   • Real long-term memory in PostgreSQL: the same person is recognised in
 *     DMs and in every group, even across @lid / phone addressing.
 *   • The 4 strict triggers (weather/menu/ping/doc) are guaranteed byte-exact.
 *   • WhatsApp formatting is enforced (never ** or #).
 *   • Alexa can never introduce herself as DeepAI / ChatGPT / "Alexa Mini",
 *     and can never claim she is unable to remember you.
 *   • Images, documents, image generation, upscaling and web search.
 *
 * REQUIRED .env
 *   DEEPAI_API_KEY=tryit-6809613270-caa24a28a55047b221b1123dd19c696a
 *   POSTGRES_URL=postgres://user:pass@host:5432/dbname
 *
 * OPTIONAL .env
 *   DEEPAI_API_KEYS=key1,key2      extra keys, rotated when one hits its quota
 *   CHAT_MODEL=standard            DeepAI model ('standard' on free keys)
 *   OCR_API_KEY=...                your own ocr.space key (reads text in images)
 *   AI_DEBUG=1                     verbose engine logging
 * ---------------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

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

  if (!key) throw new Error("DEEPAI_API_KEY is missing from .env");
  if (!postgresUrl) throw new Error("POSTGRES_URL is missing from .env");

  // Extra keys are optional: "key1,key2" in .env, or an array in config.
  const extraKeys = []
    .concat(config.DEEPAI_API_KEYS || [])
    .concat(String(process.env.DEEPAI_API_KEYS || "").split(","))
    .map((k) => String(k || "").trim())
    .filter(Boolean);

  engine = new AlexaAI({
    key,
    keys: extraKeys, // rotated automatically on "try it exceeded"
    postgresUrl,

    // --- model -------------------------------------------------------------
    // 'standard' is the safe free-tier default; anything else is tried first
    // and falls back automatically if DeepAI refuses it.
    model: config.CHAT_MODEL || process.env.CHAT_MODEL || "standard",
    fallbackModels: ["gpt-4o-mini", "standard"],
    visionModel: "gpt-4o-mini",

    // --- persona -----------------------------------------------------------
    // NOTHING here on purpose: the engine's default Alexa system prompt is
    // used, together with the identity lock and the memory guard.

    // --- conversation tuning ------------------------------------------------
    historyLimit: 14, // past messages replayed to the model
    maxMemories: 25, // facts injected per request
    sharedGroupThread: false, // false = each member has their own thread

    // --- identity -----------------------------------------------------------
    linkIdentities: true, // @lid <-> phone jid are the same human
    mergeIdentities: true, // fold duplicate rows together when proven

    // --- images ---------------------------------------------------------------
    ocr: true, // read text inside screenshots on free keys
    ocrApiKey: config.OCR_API_KEY || process.env.OCR_API_KEY, // optional

    // --- infrastructure -------------------------------------------------------
    timeout: 60000,
    maxRetries: 2,
    autoMigrate: true, // create tables on first run
    debug: Boolean(config.AI_DEBUG || process.env.AI_DEBUG),
  });

  console.log("✅ Alexa AI engine ready (DeepAI + PostgreSQL)");
  return engine;
}

// ---------------------------------------------------------------------------
//  Input normalisation
// ---------------------------------------------------------------------------

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".log": "text/plain",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function guessMime(filePath) {
  return (
    MIME_BY_EXT[path.extname(String(filePath)).toLowerCase()] || "image/jpeg"
  );
}

/**
 * Turn anything the bot might hand us into the `{ buffer | url | base64 }`
 * shape the engine expects.
 *
 * Accepts: Buffer · Uint8Array · data URI · raw base64 · http(s) URL ·
 *          local path · { buffer } · { url } · { path } · { base64 }
 * @returns {object|null}
 */
function toMedia(file) {
  if (!file) return null;

  if (Buffer.isBuffer(file)) {
    return { buffer: file, mimetype: "image/jpeg", filename: "image.jpg" };
  }
  if (file instanceof Uint8Array) {
    return {
      buffer: Buffer.from(file),
      mimetype: "image/jpeg",
      filename: "image.jpg",
    };
  }

  if (typeof file === "string") {
    // data:image/jpeg;base64,....
    const dataUri = file.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
    if (dataUri) {
      return {
        buffer: Buffer.from(dataUri[2], "base64"),
        mimetype: dataUri[1],
        filename: "image." + (dataUri[1].split("/")[1] || "jpg"),
      };
    }
    // remote URL
    if (/^https?:\/\//i.test(file)) return { url: file };
    // local path
    if (isReadableFile(file)) {
      return {
        buffer: fs.readFileSync(file),
        mimetype: guessMime(file),
        filename: path.basename(file),
      };
    }
    // bare base64 (no data: prefix)
    if (/^[A-Za-z0-9+/\s]+=*$/.test(file) && file.length > 100) {
      return {
        buffer: Buffer.from(file.replace(/\s+/g, ""), "base64"),
        mimetype: "image/jpeg",
        filename: "image.jpg",
      };
    }
    return null;
  }

  if (typeof file === "object") {
    if (file.buffer || file.url || file.base64 || file.data) {
      // already the right shape — just make sure a Buffer really is a Buffer
      const buffer =
        file.buffer instanceof Uint8Array && !Buffer.isBuffer(file.buffer)
          ? Buffer.from(file.buffer)
          : file.buffer;
      return { ...file, ...(buffer ? { buffer } : {}) };
    }
    // { path: '/tmp/x.jpg' } — the engine has no filesystem access, read it here
    if (file.path && isReadableFile(file.path)) {
      return {
        buffer: fs.readFileSync(file.path),
        mimetype: file.mimetype || guessMime(file.path),
        filename: file.filename || path.basename(file.path),
      };
    }
  }
  return null;
}

function isReadableFile(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Turn whatever the bot knows about the sender into the address list the
 * engine needs. See the IDENTITY note at the top of the file.
 *
 * Accepts:
 *   'x@lid'                                    (classic — still works)
 *   ['x@lid', '947...@s.whatsapp.net']
 *   { id, lid, phone, aliases: [] }
 */
function toIdentity(userId) {
  if (Array.isArray(userId)) {
    const list = userId.map(String).filter(Boolean);
    return { userId: list[0] || "default_user", aliases: list.slice(1) };
  }
  if (userId && typeof userId === "object") {
    const primary = userId.id || userId.jid || userId.lid || userId.phone;
    return {
      userId: String(primary || "default_user"),
      userLid: userId.lid ? String(userId.lid) : undefined,
      userPhone: userId.phone ? String(userId.phone) : undefined,
      aliases: (userId.aliases || []).map(String).filter(Boolean),
    };
  }
  return { userId: String(userId || "default_user") };
}

// ---------------------------------------------------------------------------
//  Main entry point
// ---------------------------------------------------------------------------

/**
 * Main AI function —
 *
 * @param {string|{text:string, files:Array}} message
 * @param {string|string[]|{id:string,lid?:string,phone?:string}} userId
 * @param {string} [groupId] e.g. '120363413125431525@g.us' ("" for DM)
 * @param {string} [userName]
 * @param {function} [callback] (err, reply)
 * @param {object} [options] extra per-call options: { groupName, messageId,
 *        isAdmin, model, webAccess, thinking, onToken, signal, full }
 * @returns {Promise<string>} the reply text ('' on failure)
 */
async function ai(
  message,
  userId,
  groupId = "",
  userName = "User",
  callback,
  options = {},
) {
  try {
    const client = getEngine();

    // --- normalise the message shape (string OR { text, files }) -----------
    let text = "";
    let media = null;

    if (typeof message === "string") {
      text = message;
    } else if (typeof message === "object" && message !== null) {
      text = message.text || message.body || message.caption || "";

      // `files` may hold a Buffer, a URL, a local path, a raw base64 string, a
      // data URI, or an object. `image` / `base64` / `file` are also accepted.
      const file =
        (Array.isArray(message.files) ? message.files.find(Boolean) : null) ||
        message.image ||
        message.file ||
        message.base64 ||
        null;

      media = toMedia(file);
    }

    if (!text && !media) {
      if (typeof callback === "function") callback(null, "");
      return "";
    }

    // --- ask Alexa ----------------------------------------------------------
    const result = await client.chat({
      ...toIdentity(userId),
      message: text,
      groupId: groupId ? String(groupId) : null,
      groupName: options.groupName || null,
      userName: String(userName || "User"),
      image: media,
      messageId: options.messageId || null,
      isAdmin: Boolean(options.isAdmin),
      model: options.model,
      webAccess: options.webAccess,
      thinking: options.thinking,
      onToken: options.onToken,
      signal: options.signal,
    });

    // Blocked users / disabled groups come back as an empty reply on purpose:
    // the bot should simply stay silent.
    const reply = result.text || "";

    if (typeof callback === "function") callback(null, reply);
    // `full: true` gives you chunks, generated image urls, memories, timings…
    return options.full ? result : reply;
  } catch (err) {
    console.error("❌ Error in Alexa AI call:", err.message);
    if (typeof callback === "function") callback(err.message, null);
    return options.full ? { text: "", error: err.message, chunks: [] } : "";
  }
}

/**
 * Convenience wrapper for Baileys: extracts the sender, the LID/phone pair,
 * the group, the push name and any attached image from a raw message object.
 *
 *   const reply = await ai.fromMessage(msg, sock);
 *
 * @param {object} msg   a Baileys `messages.upsert` message
 * @param {object} [sock] the Baileys socket (used to download media, optional)
 * @param {object} [options] forwarded to ai()
 */
ai.fromMessage = async (msg, sock = null, options = {}) => {
  const info = msg?.message || {};
  const remoteJid = msg?.key?.remoteJid || "";
  const isGroup = remoteJid.endsWith("@g.us");

  const sender = isGroup ? msg?.key?.participant || remoteJid : remoteJid;
  const senderAlt =
    msg?.key?.participantAlt ||
    msg?.key?.participantPn ||
    msg?.key?.senderPn ||
    null;

  const text =
    info.conversation ||
    info.extendedTextMessage?.text ||
    info.imageMessage?.caption ||
    info.videoMessage?.caption ||
    info.documentMessage?.caption ||
    "";

  // Download an attached image/document when the socket is available.
  let files = [];
  const mediaNode = info.imageMessage || info.documentMessage || null;
  if (mediaNode && sock?.downloadMediaMessage) {
    try {
      const buffer = await sock.downloadMediaMessage(msg);
      if (buffer) {
        files = [
          {
            buffer,
            mimetype: mediaNode.mimetype || "image/jpeg",
            filename: mediaNode.fileName || "image.jpg",
          },
        ];
      }
    } catch (err) {
      console.warn("⚠️  Could not download media:", err.message);
    }
  }

  return ai(
    { text, files },
    { id: sender, phone: senderAlt || undefined },
    isGroup ? remoteJid : "",
    msg?.pushName || "User",
    undefined,
    { messageId: msg?.key?.id || null, ...options },
  );
};

// ---------------------------------------------------------------------------
//  Extras — handy for bot commands. Ignore them if you don't need them.
// ---------------------------------------------------------------------------

/** `.forget` command — wipe everything Alexa remembers about a user. */
ai.forgetUser = async (userId) => getEngine().forgetAll(userId);

/** `.memory` command — show what Alexa remembers. */
ai.getMemories = async (userId) => getEngine().getMemories(userId);

/** Teach Alexa one fact by hand. */
ai.remember = async (userId, key, value) =>
  getEngine().remember(userId, key, value);

/** Forget one fact. */
ai.forget = async (userId, key) => getEngine().forget(userId, key);

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

// --- identity ---------------------------------------------------------------

/**
 * Tell Alexa two WhatsApp addresses are the same human. Call it whenever
 * Baileys reveals a mapping:
 *
 *   const pn = await sock.signalRepository.lidMapping.getPNForLID(lid);
 *   if (pn) await ai.linkIdentity(lid, pn);
 */
ai.linkIdentity = async (jidA, jidB) => getEngine().linkIdentity(jidA, jidB);

ai.getAliases = async (userId) => getEngine().getAliases(userId);

ai.whoIs = async (userId) => getEngine().whoIs(userId);

// --- media & extras ----------------------------------------------------------

ai.generateImage = async (prompt, opts) =>
  getEngine().generateImage(prompt, opts);

ai.editImage = async (file, prompt) =>
  getEngine().editImage(toMedia(file), prompt);

ai.upscaleImage = async (file) => getEngine().upscaleImage(toMedia(file));

ai.detectNsfw = async (file) => getEngine().detectNsfw(toMedia(file));

ai.describeImage = async (file, caption = "") =>
  getEngine().describeImage(toMedia(file), caption);

ai.summarizeText = async (text) => getEngine().summarizeText(text);

ai.searchWeb = async (query) => getEngine().searchWeb(query);

// --- ops ----------------------------------------------------------------------

ai.stats = async () => getEngine().stats();

ai.health = async () => getEngine().health();

ai.deepaiHealth = async () => getEngine().deepaiHealth();

ai.engine = () => getEngine();

ai.init = async () => getEngine().init();
ai.close = async () => {
  if (engine) {
    await engine.close();
    engine = null;
  }
};

module.exports = ai;
