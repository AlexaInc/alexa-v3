"use strict";

/**
 * Shared MySQL bootstrap for the bot process and the Express process.
 *
 * Both processes may start at the same time under app.js. Every statement is
 * idempotent, so it is safe for both to run this module's initializer. Keeping
 * the schema in one place also prevents the web panel and the bot from slowly
 * drifting apart.
 */
const mysql = require("mysql2");
const config = require("../config");

const pool = mysql.createPool({
  host: config.DB_HOST,
  user: config.DB_UNAME,
  password: config.DB_PASS,
  database: config.DB_NAME,
  port: config.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  // Make connection parameters use the same portable collation as tables.
  // This avoids MySQL 8 defaulting parameters to utf8mb4_0900_ai_ci while
  // older Aiven/MariaDB tables use utf8mb4_unicode_ci.
  charset: "utf8mb4_unicode_ci",
});

let initializationPromise = null;
let initialized = false;

function isConfigured() {
  return Boolean(
    config.DB_HOST && config.DB_UNAME && config.DB_NAME && config.DB_PASS,
  );
}

async function ensureColumn(db, tableName, columnName, definition) {
  const [columns] = await db.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [
    columnName,
  ]);
  if (columns.length === 0) {
    await db.query(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
    );
    console.log(`[database] Added ${tableName}.${columnName}`);
  }
}


const APP_COLLATION = "utf8mb4_unicode_ci";

/**
 * Older deployments already contain a mixture of MySQL 8's 0900 collation and
 * unicode_ci tables. A JOIN between those table columns throws ER_CANT_AGGREGATE_2COLLATIONS.
 * Normalize Alexa-owned tables once, non-destructively, during startup.
 */
async function ensureTableCollation(db, tableName) {
  const [rows] = await db.query(
    `SELECT TABLE_COLLATION
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName],
  );
  if (rows[0]?.TABLE_COLLATION !== APP_COLLATION) {
    await db.query(
      `ALTER TABLE \`${tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE ${APP_COLLATION}`,
    );
    console.log(`[database] Normalized ${tableName} collation to ${APP_COLLATION}.`);
  }
}

/**
 * Creates all first-party tables and performs additive, non-destructive
 * migrations for installations that already have the legacy groups/tasks
 * tables. Never drops or rewrites user data.
 */
async function initialize() {
  if (initialized) return true;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    if (!isConfigured()) {
      console.warn(
        "[database] MySQL is not configured; account and panel features are unavailable.",
      );
      return false;
    }

    const db = pool.promise();
    await db.query("SELECT 1");

    // Existing bot configuration and task tables.
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`groups\` (
        group_id VARCHAR(255) NOT NULL PRIMARY KEY,
        chatbot TINYINT(1) NOT NULL DEFAULT 0,
        antilink TINYINT(1) NOT NULL DEFAULT 0,
        link_a VARCHAR(50) NOT NULL DEFAULT 'delete',
        antinsfw TINYINT(1) NOT NULL DEFAULT 0,
        nsfw_a VARCHAR(50) NOT NULL DEFAULT 'delete',
        is_allow_bots TINYINT(1) NOT NULL DEFAULT 0,
        is_welcome TINYINT(1) NOT NULL DEFAULT 0,
        wc_m TEXT DEFAULT NULL,
        isleft_w TINYINT(1) NOT NULL DEFAULT 0,
        left_m TEXT DEFAULT NULL,
        locale VARCHAR(16) NOT NULL DEFAULT 'en',
        timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Colombo',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS conversation_history (
        id VARCHAR(255) NOT NULL PRIMARY KEY,
        conventions LONGTEXT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        user_id VARCHAR(255) NOT NULL PRIMARY KEY,
        tasks LONGTEXT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Canonical account record. The password has both a one-way scrypt hash
    // for authentication and an AES-GCM encrypted copy so `.profile` can
    // display credentials as requested without ever storing plaintext.
    await db.query(`
      CREATE TABLE IF NOT EXISTS bot_users (
        lid_username VARCHAR(255) NOT NULL PRIMARY KEY,
        whatsapp_jid VARCHAR(255) DEFAULT NULL,
        display_name VARCHAR(255) DEFAULT NULL,
        password_hash VARCHAR(255) NOT NULL,
        password_ciphertext TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_bot_users_jid (whatsapp_jid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_lid VARCHAR(255) NOT NULL PRIMARY KEY,
        private_chatbot TINYINT(1) NOT NULL DEFAULT 1,
        locale VARCHAR(16) NOT NULL DEFAULT 'en',
        timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Colombo',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // A server-side group directory. It is refreshed after every successful
    // WhatsApp connection and participant/admin change, which makes panel
    // permissions reflect current WhatsApp admin status rather than stale data.
    await db.query(`
      CREATE TABLE IF NOT EXISTS group_directory (
        group_id VARCHAR(255) NOT NULL PRIMARY KEY,
        subject VARCHAR(255) NOT NULL DEFAULT 'Unnamed group',
        member_count INT NOT NULL DEFAULT 0,
        bot_is_admin TINYINT(1) NOT NULL DEFAULT 0,
        metadata_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS group_admin_memberships (
        group_id VARCHAR(255) NOT NULL,
        user_lid VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) DEFAULT NULL,
        is_admin TINYINT(1) NOT NULL DEFAULT 0,
        synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_lid),
        INDEX idx_group_admin_user (user_lid, is_admin)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Game tables are declared here as well as in their game modules. This
    // means a profile created on first bot interaction is immediately wired to
    // its RPG/economy/shop records, even before a game command is used.
    await db.query(`
      CREATE TABLE IF NOT EXISTS economy_users (
        user_id VARCHAR(255) NOT NULL PRIMARY KEY,
        balance BIGINT NOT NULL DEFAULT 0,
        bank BIGINT NOT NULL DEFAULT 0,
        last_daily BIGINT NOT NULL DEFAULT 0,
        last_work BIGINT NOT NULL DEFAULT 0,
        last_rob BIGINT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS rpg_users (
        user_id VARCHAR(255) NOT NULL PRIMARY KEY,
        class VARCHAR(50) DEFAULT NULL,
        level INT NOT NULL DEFAULT 1,
        xp INT NOT NULL DEFAULT 0,
        power INT NOT NULL DEFAULT 10,
        wins INT NOT NULL DEFAULT 0,
        losses INT NOT NULL DEFAULT 0,
        last_train BIGINT NOT NULL DEFAULT 0,
        last_dungeon BIGINT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS shop_inventory (
        user_id VARCHAR(255) NOT NULL,
        item_id VARCHAR(100) NOT NULL,
        qty INT NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, item_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS shop_profile (
        user_id VARCHAR(255) NOT NULL PRIMARY KEY,
        title VARCHAR(60) DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS command_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        command_name VARCHAR(100) NOT NULL,
        group_id VARCHAR(255) DEFAULT NULL,
        user_id_hash CHAR(32) DEFAULT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'received',
        duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_command_events_created (created_at),
        INDEX idx_command_events_group_created (group_id, created_at),
        INDEX idx_command_events_name_created (command_name, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id CHAR(36) NOT NULL PRIMARY KEY,
        group_id VARCHAR(255) NOT NULL,
        created_by VARCHAR(255) NOT NULL,
        name VARCHAR(120) NOT NULL,
        schedule_type ENUM('once','daily','weekly') NOT NULL,
        timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Colombo',
        message TEXT NOT NULL,
        run_at DATETIME NOT NULL,
        next_run_at DATETIME DEFAULT NULL,
        last_run_at DATETIME DEFAULT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_scheduled_due (enabled, next_run_at),
        INDEX idx_scheduled_group (group_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Additive migration path for legacy installs made before this service.
    await ensureColumn(db, "groups", "chatbot", "TINYINT(1) NOT NULL DEFAULT 0");
    await ensureColumn(db, "groups", "antilink", "TINYINT(1) NOT NULL DEFAULT 0");
    await ensureColumn(db, "groups", "link_a", "VARCHAR(50) NOT NULL DEFAULT 'delete'");
    await ensureColumn(db, "groups", "antinsfw", "TINYINT(1) NOT NULL DEFAULT 0");
    await ensureColumn(db, "groups", "nsfw_a", "VARCHAR(50) NOT NULL DEFAULT 'delete'");
    await ensureColumn(db, "groups", "is_allow_bots", "TINYINT(1) NOT NULL DEFAULT 0");
    await ensureColumn(db, "groups", "is_welcome", "TINYINT(1) NOT NULL DEFAULT 0");
    await ensureColumn(db, "groups", "wc_m", "TEXT DEFAULT NULL");
    await ensureColumn(db, "groups", "isleft_w", "TINYINT(1) NOT NULL DEFAULT 0");
    await ensureColumn(db, "groups", "left_m", "TEXT DEFAULT NULL");
    await ensureColumn(db, "groups", "locale", "VARCHAR(16) NOT NULL DEFAULT 'en'");
    await ensureColumn(db, "groups", "timezone", "VARCHAR(64) NOT NULL DEFAULT 'Asia/Colombo'");
    await ensureColumn(db, "user_profiles", "locale", "VARCHAR(16) NOT NULL DEFAULT 'en'");

    // Migrate tables created by older Alexa releases before this unified
    // collation policy existed. This fixes the dashboard JOIN failure without
    // deleting accounts, game progress or group configuration.
    for (const tableName of [
      "groups",
      "conversation_history",
      "tasks",
      "bot_users",
      "user_profiles",
      "group_directory",
      "group_admin_memberships",
      "economy_users",
      "rpg_users",
      "shop_inventory",
      "shop_profile",
      "command_events",
      "scheduled_jobs",
    ]) {
      await ensureTableCollation(db, tableName);
    }

    initialized = true;
    console.log("[database] MySQL schema is ready.");
    return true;
  })();

  try {
    return await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    console.error("[database] Schema initialization failed:", error.message);
    throw error;
  }
}

function getPool() {
  return pool;
}

function isInitialized() {
  return initialized;
}

module.exports = {
  getPool,
  initialize,
  isConfigured,
  isInitialized,
};
