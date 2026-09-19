"use strict";

/**
 * Canonical Alexa account/profile service.
 *
 * Account identifiers deliberately use the WhatsApp LID (`123...@lid`) so the
 * same identifier is used by RPG, economy and shop records. Password hashes
 * use scrypt; the separately encrypted password lets the requested `.profile`
 * command show credentials without a plaintext column ever existing in MySQL.
 */
const crypto = require("crypto");
const { promisify } = require("util");
const config = require("../config");
const database = require("./database");

const scrypt = promisify(crypto.scrypt);
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

function cleanString(value) {
  return String(value || "").trim();
}

function isLid(value) {
  return cleanString(value).toLowerCase().endsWith("@lid");
}

function normalizeLid(value) {
  const lid = cleanString(value).toLowerCase();
  if (!isLid(lid)) return null;
  // WhatsApp may attach a device suffix before @lid. Usernames must be stable.
  return lid.replace(/:\d+(?=@lid$)/, "");
}

function encryptionKey() {
  // CREDENTIAL_ENCRYPTION_KEY should be a dedicated random secret. SESSION_SECRET
  // is retained as a backwards-compatible fallback so existing deployments work,
  // but deployment docs instruct operators to set the dedicated key.
  const secret = config.CREDENTIAL_ENCRYPTION_KEY || config.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY (or SESSION_SECRET) is required for account credentials.",
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptPassword(ciphertext) {
  const [version, ivValue, tagValue, encryptedValue] = String(
    ciphertext || "",
  ).split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    return null;
  }
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    console.warn(
      "[profiles] Could not decrypt a stored credential:",
      error.message,
    );
    return null;
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, saltValue, hashValue] = String(storedHash || "").split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  try {
    const actual = await scrypt(
      password,
      Buffer.from(saltValue, "base64url"),
      64,
    );
    const expected = Buffer.from(hashValue, "base64url");
    return (
      actual.length === expected.length &&
      crypto.timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

function generatePassword() {
  // 24 URL-safe characters from cryptographically secure random bytes.
  return crypto.randomBytes(18).toString("base64url");
}

function validateNewPassword(value) {
  const password = String(value || "");
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return {
      ok: false,
      message: `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters long.`,
    };
  }
  if (/\r|\n/.test(password)) {
    return { ok: false, message: "Password cannot contain line breaks." };
  }
  return { ok: true, password };
}

/**
 * Ensures a bot account and its game records exist. `lid` must be an actual
 * WhatsApp LID; callers should wait for Baileys' LID mapping instead of
 * inventing an identifier from a phone number.
 */
async function ensureAccount({ lid, whatsappJid = null, displayName = null }) {
  const username = normalizeLid(lid);
  if (!username) {
    return { account: null, created: false, reason: "lid-unavailable" };
  }
  await database.initialize();
  const db = database.getPool().promise();
  const [existingRows] = await db.query(
    "SELECT lid_username FROM bot_users WHERE lid_username = ?",
    [username],
  );

  let generatedPassword = null;
  if (existingRows.length === 0) {
    generatedPassword = generatePassword();
    await db.query(
      `INSERT INTO bot_users
        (lid_username, whatsapp_jid, display_name, password_hash, password_ciphertext)
       VALUES (?, ?, ?, ?, ?)`,
      [
        username,
        cleanString(whatsappJid) || null,
        cleanString(displayName).slice(0, 255) || null,
        await hashPassword(generatedPassword),
        encryptPassword(generatedPassword),
      ],
    );
  } else {
    await db.query(
      `UPDATE bot_users
       SET whatsapp_jid = COALESCE(?, whatsapp_jid),
           display_name = COALESCE(?, display_name)
       WHERE lid_username = ?`,
      [
        cleanString(whatsappJid) || null,
        cleanString(displayName).slice(0, 255) || null,
        username,
      ],
    );
  }

  // All game modules use the same LID as user_id. INSERT IGNORE preserves all
  // existing XP, cash, inventory and titles while creating the missing rows.
  await db.query("INSERT IGNORE INTO user_profiles (user_lid) VALUES (?)", [
    username,
  ]);
  await db.query("INSERT IGNORE INTO economy_users (user_id) VALUES (?)", [
    username,
  ]);
  await db.query("INSERT IGNORE INTO rpg_users (user_id) VALUES (?)", [
    username,
  ]);
  await db.query("INSERT IGNORE INTO shop_profile (user_id) VALUES (?)", [
    username,
  ]);

  const account = await findByUsername(username);
  return { account, created: existingRows.length === 0, generatedPassword };
}

async function findByUsername(username) {
  const lid = normalizeLid(username);
  if (!lid) return null;
  await database.initialize();
  const [rows] = await database
    .getPool()
    .promise()
    .query(
      `SELECT lid_username, whatsapp_jid, display_name, password_hash,
              password_ciphertext, created_at, last_login_at
       FROM bot_users WHERE lid_username = ?`,
      [lid],
    );
  return rows[0] || null;
}

async function authenticate(username, password) {
  const account = await findByUsername(username);
  if (
    !account ||
    !(await verifyPassword(String(password || ""), account.password_hash))
  ) {
    return null;
  }
  await database
    .getPool()
    .promise()
    .query(
      "UPDATE bot_users SET last_login_at = CURRENT_TIMESTAMP WHERE lid_username = ?",
      [account.lid_username],
    );
  return {
    lid: account.lid_username,
    whatsappJid: account.whatsapp_jid,
    displayName: account.display_name,
    // The web server uses exactly the same owner identity settings as bot.js
    // (`Owner_id` and `Owner_nb`) instead of maintaining a second web-only
    // username/password pair.
    isOwner: isConfiguredOwner(account),
  };
}

function normalizeWhatsAppIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+(?=@)/, "");
}

function phonePart(value) {
  // Compare the numeric JID local-part separately so @s.whatsapp.net, @c.us,
  // a raw phone number, and a device-suffixed JID all identify the same owner.
  return String(value || "")
    .split("@")[0]
    .replace(/:\d+$/, "")
    .replace(/\D/g, "");
}

function isConfiguredOwner(account) {
  const ownerLids = new Set(
    (config.OWNER_ID || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
      .map((id) =>
        normalizeWhatsAppIdentity(id.includes("@") ? id : `${id}@lid`),
      ),
  );
  const ownerNumbers = new Set(
    (config.OWNER_NB || []).map(phonePart).filter(Boolean),
  );

  return (
    ownerLids.has(normalizeWhatsAppIdentity(account.lid_username)) ||
    ownerNumbers.has(phonePart(account.whatsapp_jid))
  );
}

async function changePassword(lid, newPassword) {
  const username = normalizeLid(lid);
  const validation = validateNewPassword(newPassword);
  if (!username) throw new Error("A WhatsApp LID is required.");
  if (!validation.ok) return validation;

  await database.initialize();
  const result = await database
    .getPool()
    .promise()
    .query(
      `UPDATE bot_users
       SET password_hash = ?, password_ciphertext = ?
       WHERE lid_username = ?`,
      [
        await hashPassword(validation.password),
        encryptPassword(validation.password),
        username,
      ],
    );
  if (result[0].affectedRows === 0) {
    return { ok: false, message: "Account not found. Send .profile first." };
  }
  return { ok: true, message: "Password changed successfully." };
}

async function getPrivateChatbot(lid) {
  const username = normalizeLid(lid);
  if (!username) return true;
  await database.initialize();
  const [rows] = await database
    .getPool()
    .promise()
    .query("SELECT private_chatbot FROM user_profiles WHERE user_lid = ?", [
      username,
    ]);
  // Existing users keep the historical bot behaviour (AI enabled) until they
  // explicitly turn it off.
  return rows.length === 0 ? true : Boolean(rows[0].private_chatbot);
}

async function setPrivateChatbot(lid, enabled) {
  const username = normalizeLid(lid);
  if (!username) throw new Error("A WhatsApp LID is required.");
  await database.initialize();
  await database
    .getPool()
    .promise()
    .query(
      `INSERT INTO user_profiles (user_lid, private_chatbot)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE private_chatbot = VALUES(private_chatbot)`,
      [username, Boolean(enabled)],
    );
  return Boolean(enabled);
}

async function getProfileSummary(lid) {
  const username = normalizeLid(lid);
  if (!username) return null;
  await database.initialize();
  const [rows] = await database
    .getPool()
    .promise()
    .query(
      `SELECT u.lid_username, u.display_name, u.created_at, u.password_ciphertext,
              p.private_chatbot,
              e.balance, e.bank,
              r.class AS rpg_class, r.level AS rpg_level, r.xp AS rpg_xp,
              r.power AS rpg_power, r.wins AS rpg_wins, r.losses AS rpg_losses,
              sp.title AS shop_title,
              COALESCE((SELECT SUM(i.qty) FROM shop_inventory i
                        WHERE i.user_id COLLATE utf8mb4_unicode_ci = u.lid_username COLLATE utf8mb4_unicode_ci), 0) AS inventory_count
       FROM bot_users u
       LEFT JOIN user_profiles p ON p.user_lid COLLATE utf8mb4_unicode_ci = u.lid_username COLLATE utf8mb4_unicode_ci
       LEFT JOIN economy_users e ON e.user_id COLLATE utf8mb4_unicode_ci = u.lid_username COLLATE utf8mb4_unicode_ci
       LEFT JOIN rpg_users r ON r.user_id COLLATE utf8mb4_unicode_ci = u.lid_username COLLATE utf8mb4_unicode_ci
       LEFT JOIN shop_profile sp ON sp.user_id COLLATE utf8mb4_unicode_ci = u.lid_username COLLATE utf8mb4_unicode_ci
       WHERE u.lid_username COLLATE utf8mb4_unicode_ci = ?`,
      [username],
    );
  if (!rows[0]) return null;
  const profile = rows[0];
  return {
    ...profile,
    password: decryptPassword(profile.password_ciphertext),
  };
}

function formatProfileMessage(profile) {
  if (!profile) return "No Alexa account was found yet.";
  const cash = Number(profile.balance || 0).toLocaleString();
  const bank = Number(profile.bank || 0).toLocaleString();
  const password =
    profile.password ||
    "Unavailable — use .changpw <new password> to reset it.";
  return [
    "🔐 *ALEXA ACCOUNT PROFILE*",
    "",
    `👤 Name: *${profile.display_name || "Alexa user"}*`,
    `🆔 Username (LID): \`${profile.lid_username}\``,
    `🔑 Password: \`${password}\``,
    `🤖 Private chatbot: *${profile.private_chatbot ? "ON" : "OFF"}*`,
    "",
    "🎮 *Connected Game Profile*",
    `⚔️ Class: *${profile.rpg_class || "Unassigned"}*`,
    `📈 Level: *${profile.rpg_level || 1}* | XP: *${profile.rpg_xp || 0}*`,
    `💪 Power: *${profile.rpg_power || 10}* | W/L: *${profile.rpg_wins || 0}/${profile.rpg_losses || 0}*`,
    `💰 Wallet: *${cash} AC* | Bank: *${bank} AC*`,
    `🎒 Items: *${profile.inventory_count || 0}*${profile.shop_title ? ` | Title: *${profile.shop_title}*` : ""}`,
    "",
    "Keep your password private. Change it in a private chat with:",
    "`.changpw <new password>`",
  ].join("\n");
}
function formatsecretProfileMessage(profile) {
  if (!profile) return "No Alexa account was found yet.";
  const cash = Number(profile.balance || 0).toLocaleString();
  const bank = Number(profile.bank || 0).toLocaleString();
  const password =
    profile.password ||
    "Unavailable — use .changpw <new password> to reset it.";
  return [
    "🔐 *ALEXA ACCOUNT PROFILE*",
    "",
    `👤 Name: *${profile.display_name || "Alexa user"}*`,
    `🆔 Username (LID): hidden for groups`,
    `🔑 Password: hidden for groups`,
    `🤖 Private chatbot: *hidden for groups*`,
    "",
    "🎮 *Connected Game Profile*",
    `⚔️ Class: *${profile.rpg_class || "Unassigned"}*`,
    `📈 Level: *${profile.rpg_level || 1}* | XP: *${profile.rpg_xp || 0}*`,
    `💪 Power: *${profile.rpg_power || 10}* | W/L: *${profile.rpg_wins || 0}/${profile.rpg_losses || 0}*`,
    `💰 Wallet: *${cash} AC* | Bank: *${bank} AC*`,
    `🎒 Items: *${profile.inventory_count || 0}*${profile.shop_title ? ` | Title: *${profile.shop_title}*` : ""}`,
    "",
    "Keep your password private. Change it in a private chat with:",
  ].join("\n");
}
module.exports = {
  ensureAccount,
  findByUsername,
  authenticate,
  changePassword,
  getPrivateChatbot,
  formatsecretProfileMessage,
  setPrivateChatbot,
  getProfileSummary,
  formatProfileMessage,
  normalizeLid,
  isLid,
  validateNewPassword,
};
