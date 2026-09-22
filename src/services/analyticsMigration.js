"use strict";

const fs = require("fs");
const path = require("path");
const database = require("./database");

const MIGRATION_KEY = "local-analytics-json-v1";
const root = path.join(__dirname, "..", "..");

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.warn(`[analytics-migration] Skipped ${file}: ${error.message}`);
    return fallback;
  }
}

async function migrateRankings(connection, counters) {
  const folder = path.join(root, "database", "rankings");
  if (!fs.existsSync(folder)) return;
  for (const filename of fs
    .readdirSync(folder)
    .filter((name) => name.endsWith(".json"))) {
    const groupId = filename.slice(0, -5);
    const users = readJson(path.join(folder, filename), {});
    for (const [userId, stats] of Object.entries(users)) {
      await connection.query(
        `INSERT INTO group_member_stats (group_id, user_id, total_messages)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE total_messages = GREATEST(total_messages, VALUES(total_messages))`,
        [groupId, userId, Math.max(0, Number(stats.global) || 0)],
      );
      if (stats.daily?.dayKey && stats.daily?.count) {
        await connection.query(
          `INSERT INTO group_message_daily
             (group_id, stat_date, user_id, message_type, message_count)
           VALUES (?, ?, ?, 'legacy', ?)
           ON DUPLICATE KEY UPDATE message_count = GREATEST(message_count, VALUES(message_count))`,
          [
            groupId,
            stats.daily.dayKey,
            userId,
            Math.max(0, Number(stats.daily.count) || 0),
          ],
        );
      }
      counters.rankings += 1;
    }
  }
}

async function migrateInvites(connection, counters) {
  const folder = path.join(root, "database", "add_counts");
  if (!fs.existsSync(folder)) return;
  for (const filename of fs
    .readdirSync(folder)
    .filter((name) => name.endsWith(".json"))) {
    const groupId = filename.slice(0, -5);
    const users = readJson(path.join(folder, filename), {});
    for (const [userId, count] of Object.entries(users)) {
      await connection.query(
        `INSERT INTO group_member_stats (group_id, user_id, invitations_count)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE invitations_count = GREATEST(invitations_count, VALUES(invitations_count))`,
        [groupId, userId, Math.max(0, Number(count) || 0)],
      );
      counters.invites += 1;
    }
  }
}

async function migrateWarnings(connection, counters) {
  const warnings = readJson(path.join(root, "data", "warnings.json"), {});
  for (const [groupId, users] of Object.entries(warnings)) {
    for (const [userId, count] of Object.entries(users || {})) {
      await connection.query(
        `INSERT INTO group_warning_state (group_id, user_id, warning_count)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE warning_count = GREATEST(warning_count, VALUES(warning_count))`,
        [groupId, userId, Math.max(0, Number(count) || 0)],
      );
      counters.warnings += 1;
    }
  }
}

async function migrateContacts(connection, counters) {
  const contacts = readJson(path.join(root, "data", "userscontact.json"), []);
  for (const contact of Array.isArray(contacts) ? contacts : []) {
    const identity = contact.id || contact.lid || contact.jid || contact.number;
    if (!identity) continue;
    await connection.query(
      `INSERT INTO contact_directory
         (identity_id, kind, phone_number, jid, lid, display_name, is_private)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE phone_number=VALUES(phone_number), jid=VALUES(jid),
         lid=VALUES(lid), display_name=VALUES(display_name), is_private=GREATEST(is_private, VALUES(is_private))`,
      [
        identity,
        contact.type === "group" ? "group" : "user",
        contact.number || null,
        contact.jid || null,
        contact.lid || null,
        contact.name || null,
        Boolean(contact.isPrivate),
      ],
    );
    counters.contacts += 1;
  }
}

async function migrateLegacyAnalytics() {
  if (!(await database.initialize())) return { skipped: true };
  const pool = database.getPool().promise();
  const [done] = await pool.query(
    "SELECT migration_key FROM analytics_migrations WHERE migration_key = ?",
    [MIGRATION_KEY],
  );
  if (done.length) return { skipped: true };

  const connection = await pool.getConnection();
  const counters = { rankings: 0, invites: 0, warnings: 0, contacts: 0 };
  try {
    await connection.beginTransaction();
    await migrateRankings(connection, counters);
    await migrateInvites(connection, counters);
    await migrateWarnings(connection, counters);
    await migrateContacts(connection, counters);
    await connection.query(
      "INSERT INTO analytics_migrations (migration_key, details) VALUES (?, ?)",
      [MIGRATION_KEY, JSON.stringify(counters)],
    );
    await connection.commit();
    console.log(
      `[analytics-migration] Local JSON imported: ${JSON.stringify(counters)}`,
    );
    return counters;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { MIGRATION_KEY, migrateLegacyAnalytics };
