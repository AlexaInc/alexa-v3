/**
 * src/config.js
 * ---------------------------------------------------------------------------
 * Central configuration loader for the whole app.
 *
 * WHY THIS FILE EXISTS
 *   Previously every entry point (index.js, bot.js, server.js, ...) called
 *   `require('dotenv').config()` on its own, scattered in the middle of its
 *   require list — so environment variables were read OUT OF ORDER:
 *     • app.js never loaded .env at all (PROXY_URL was always empty there),
 *     • index.js required other modules BEFORE dotenv ran,
 *     • several sub-modules (emojicook, web.js, ai.js, ...) re-called dotenv.
 *
 * HOW TO USE
 *   `require('./config')` must be the FIRST require in every entry point:
 *     app.js, src/index.js, src/server.js, and every script in tools/.
 *   Anything required after it can safely read process.env at top level.
 *
 * This module also exports a typed view of EVERY variable the app
 * understands. Keep it in sync with `env_dummy` (the .env template).
 * ---------------------------------------------------------------------------
 */
const path = require("path");
const dotenv = require("dotenv");

/** Absolute path to the repository root (one level above src/). */
const ROOT_DIR = path.join(__dirname, "..");

// Load the env file exactly once, from the repo root, regardless of the
// process cwd. Variables already present in the real environment (Docker /
// GAE / PM2 / HF Space) always win — dotenv never overrides them.
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const env = process.env;

// --- small coercion helpers ---------------------------------------------
const str = (value, fallback = "") =>
  value === undefined || value === "" ? fallback : String(value);
const int = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (value, fallback = false) =>
  value === undefined ? fallback : String(value).toLowerCase() === "true";
const list = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const config = {
  ROOT_DIR,

  /** Server port (web panel + dashboard). */
  PORT: int(env.PORT, 8000),

  // ── Web admin panel ─────────────────────────────────────────────────
  ADMIN_USERNAME: str(env.ADMIN_USERNAME),
  ADMIN_PASSWORD: str(env.ADMIN_PASSWORD),
  /** express-session signing secret. */
  SESSION_SECRET: str(env.SESSION_SECRET),
  /** GitHub webhook HMAC secret (recommended). */
  WEBHOOK_SECRET: str(env.WEBHOOK_SECRET),

  // ── MySQL database ──────────────────────────────────────────────────
  DB_HOST: str(env.DB_HOST),
  DB_PORT: int(env.DB_PORT, 3306),
  DB_UNAME: str(env.DB_UNAME),
  DB_NAME: str(env.DB_NAME),
  DB_PASS: str(env.DB_PASS),
  HF_TOKEN: str(env.HF_TOKEN),

  // ── WhatsApp bot / owners ───────────────────────────────────────────
  /** Bot's own WhatsApp number (used for wa.me links). */
  BOT_NB: str(env.bot_nb),
  /** Comma-separated owner numbers. */
  OWNER_NB: list(env.Owner_nb),
  /** Comma-separated owner LIDs. */
  OWNER_ID: list(env.Owner_id),
  /** Comma-separated special/rank numbers. */
  SPC_NB: list(env.spc_nb),
  /** Owner chat JID that receives dashboard "gitpush" broadcasts. */
  OWNER_CHAT_ID: str(env.ocid),
  /** Dashboard WebSocket URL (index.js connects here when set). */
  ALEXASOCK_URL: str(env.Alexasock_url),

  // ── AI / content APIs ───────────────────────────────────────────────
  /** Used by tools/ai.js (standalone OpenRouter client). */
  OPENROUTER_TOKEN: str(env.OPENROUTER_TOKEN),
  OPENROUTER_TOKEN1: str(env.OPENROUTER_TOKEN1),
  OPENROUTER_TOKEN2: str(env.OPENROUTER_TOKEN2),
  OPENROUTER_TOKEN3: str(env.OPENROUTER_TOKEN3),
  OPENROUTER_TOKEN4: str(env.OPENROUTER_TOKEN4),
  CHAT_MODEL: str(env.CHAT_MODEL),
  NIGHTAPI_AUTH: str(env.NIGHTAPI_AUTH),
  TENOR_API_KEY: str(env.TENOR_API_KEY),
  /** DeepAI API key used by src/modules/Aii.js. */
  DEEPAI_API_KEY: str(env.DEEPAI_API_KEY),
  POSTGRES_URL: str(env.POSTGRES_URL),
  // ── Google Custom Search (src/services/websearch.js) ────────────────
  GOOGLE_API_KEY: str(env.GOOGLE_API_KEY),
  GOOGLESEARCH_ENGINE_ID: str(env.GOOGLESEARCH_ENGINE_ID),

  // ── Proxy (V2Ray/Xray sidecar + http(s) agents) ─────────────────────
  PROXY_URL: str(env.PROXY_URL),
  PROXY_REJECT_UNAUTHORIZED: bool(env.PROXY_REJECT_UNAUTHORIZED, false),
  PROXY_TIMEOUT: int(env.PROXY_TIMEOUT, 60000),
  /** Set to "false" to skip installing the global http/https agents. */
  PROXY_DISABLE_GLOBAL: bool(env.PROXY_DISABLE_GLOBAL, false),
  /** Comma-separated hosts that must bypass the proxy. */
  NO_PROXY: list(env.NO_PROXY),

  // ── Legacy ──────────────────────────────────────────────────────────
  /** Legacy: passed as dbPath to FilterManager in src/bot.js. */
  MONGO_URL: str(env.mongo_url),
};

// ---------------------------------------------------------------------------
// Startup sanity check — warn (do not crash) about missing critical values.
// ---------------------------------------------------------------------------
(function warnAboutMissing() {
  const critical = [
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD",
    "SESSION_SECRET",
    "DB_HOST",
    "DB_UNAME",
    "DB_NAME",
    "DB_PASS",
    "Owner_nb",
    "bot_nb",
  ];
  const missing = critical.filter(
    (key) => env[key] === undefined || env[key] === "",
  );
  if (missing.length > 0) {
    console.warn(
      `⚠️  config: missing environment variables: ${missing.join(", ")}`,
    );
    console.warn(
      "⚠️  config: copy env_dummy to .env (or set them in your PaaS) and fill them in.",
    );
  }
})();

module.exports = config;
