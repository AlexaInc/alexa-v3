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

const STUB_CLEANUP_KEY = "participant-stub-cleanup-v1";

async function cleanupParticipantStubMessages() {
  if (!(await database.initialize())) return { skipped: true };
  const pool = database.getPool().promise();
  const [done] = await pool.query(
    "SELECT migration_key FROM analytics_migrations WHERE migration_key = ?",
    [STUB_CLEANUP_KEY],
  );
  if (done.length) return { skipped: true };

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [corrections] = await connection.query(
      `SELECT d.group_id, d.user_id,
              SUM(LEAST(d.message_count, events.event_count)) AS correction
       FROM group_message_daily d
       INNER JOIN (
         SELECT group_id, member_id, DATE(created_at) AS event_date, COUNT(*) AS event_count
         FROM group_member_events
         GROUP BY group_id, member_id, DATE(created_at)
       ) events
         ON events.group_id = d.group_id
        AND events.member_id = d.user_id
        AND events.event_date = d.stat_date
       WHERE d.message_type = 'other'
       GROUP BY d.group_id, d.user_id`,
    );
    for (const row of corrections) {
      await connection.query(
        `UPDATE group_member_stats
         SET total_messages = GREATEST(0, total_messages - ?)
         WHERE group_id = ? AND user_id = ?`,
        [Number(row.correction || 0), row.group_id, row.user_id],
      );
    }
    await connection.query(
      `UPDATE group_message_daily d
       INNER JOIN (
         SELECT group_id, member_id, DATE(created_at) AS event_date, COUNT(*) AS event_count
         FROM group_member_events
         GROUP BY group_id, member_id, DATE(created_at)
       ) events
         ON events.group_id = d.group_id
        AND events.member_id = d.user_id
        AND events.event_date = d.stat_date
       SET d.message_count = GREATEST(0, d.message_count - events.event_count)
       WHERE d.message_type = 'other'`,
    );
    await connection.query(
      `UPDATE group_message_hourly h
       INNER JOIN (
         SELECT group_id, member_id, DATE(created_at) AS event_date,
                HOUR(created_at) AS event_hour, COUNT(*) AS event_count
         FROM group_member_events
         GROUP BY group_id, member_id, DATE(created_at), HOUR(created_at)
       ) events
         ON events.group_id = h.group_id
        AND events.member_id = h.user_id
        AND events.event_date = h.stat_date
        AND events.event_hour = h.stat_hour
       SET h.message_count = GREATEST(0, h.message_count - events.event_count)
       WHERE h.message_type = 'other'`,
    );
    await connection.query(
      "DELETE FROM group_message_daily WHERE message_count = 0",
    );
    await connection.query(
      "DELETE FROM group_message_hourly WHERE message_count = 0",
    );
    await connection.query(
      "INSERT INTO analytics_migrations (migration_key, details) VALUES (?, ?)",
      [
        STUB_CLEANUP_KEY,
        JSON.stringify({ correctedMembers: corrections.length }),
      ],
    );
    await connection.commit();
    console.log(
      `[analytics-migration] Removed participant-event message pollution for ${corrections.length} member(s).`,
    );
    return { correctedMembers: corrections.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  MIGRATION_KEY,
  STUB_CLEANUP_KEY,
  cleanupParticipantStubMessages,
  migrateLegacyAnalytics,
};
