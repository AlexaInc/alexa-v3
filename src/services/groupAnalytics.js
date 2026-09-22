"use strict";

const database = require("./database");

const pending = new Map();
let flushTimer = null;
let flushPromise = null;

function unwrapMessage(message = {}) {
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  );
}

function messageDetails(msg) {
  const content = unwrapMessage(msg?.message || {});
  const text =
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    "";
  let type = "other";
  if (content.conversation || content.extendedTextMessage) type = "text";
  else if (content.stickerMessage) type = "sticker";
  else if (content.imageMessage) type = "photo";
  else if (content.videoMessage) type = "video";
  else if (content.audioMessage?.ptt) type = "voice";
  else if (content.audioMessage) type = "audio";
  else if (content.documentMessage) type = "file";
  else if (content.contactMessage || content.contactsArrayMessage)
    type = "contact";
  else if (content.locationMessage || content.liveLocationMessage)
    type = "location";
  else if (content.pollCreationMessage || content.pollCreationMessageV3)
    type = "poll";
  return { type, characters: String(text).length };
}

function messageIdentity(msg) {
  const groupId = String(msg?.key?.remoteJid || "");
  if (!groupId.endsWith("@g.us")) return null;
  const userId =
    msg.key.participant || msg.key.participantAlt || msg.participant || null;
  if (!userId) return null;
  return {
    groupId,
    userId: String(userId),
    displayName: String(msg.pushName || "").slice(0, 255) || null,
  };
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush().catch((error) =>
      console.error("[group-analytics] Flush failed:", error.message),
    );
  }, 3000);
  flushTimer.unref?.();
}

function isTrackableMessage(msg) {
  if (!msg || msg.key?.fromMe) return false;
  if (msg.messageStubType !== undefined && msg.messageStubType !== null) {
    return false;
  }
  if (
    Array.isArray(msg.messageStubParameters) &&
    msg.messageStubParameters.length
  ) {
    return false;
  }
  if (!msg.message || !Object.keys(msg.message).length) return false;
  const content = unwrapMessage(msg.message);
  if (!content || !Object.keys(content).length) return false;
  return !(
    content.protocolMessage ||
    content.reactionMessage ||
    content.senderKeyDistributionMessage ||
    content.keepInChatMessage ||
    content.pollUpdateMessage
  );
}

function recordMessage(msg) {
  if (!isTrackableMessage(msg)) return;
  const identity = messageIdentity(msg);
  if (!identity) return;
  const details = messageDetails(msg);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = now.getUTCHours();
  const key = `${identity.groupId}\u0000${date}\u0000${hour}\u0000${identity.userId}\u0000${details.type}`;
  const value = pending.get(key) || {
    ...identity,
    date,
    hour,
    type: details.type,
    count: 0,
    characters: 0,
  };
  value.count += 1;
  value.characters += details.characters;
  if (identity.displayName) value.displayName = identity.displayName;
  pending.set(key, value);
  scheduleFlush();
}

async function flush() {
  if (flushPromise) return flushPromise;
  if (!pending.size) return;
  const batch = [...pending.values()];
  pending.clear();
  flushPromise = (async () => {
    if (!(await database.initialize())) return;
    const connection = await database.getPool().promise().getConnection();
    try {
      await connection.beginTransaction();
      for (const row of batch) {
        await connection.query(
          `INSERT INTO group_message_daily
             (group_id, stat_date, user_id, message_type, message_count, character_count)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             message_count = message_count + VALUES(message_count),
             character_count = character_count + VALUES(character_count)`,
          [
            row.groupId,
            row.date,
            row.userId,
            row.type,
            row.count,
            row.characters,
          ],
        );
        await connection.query(
          `INSERT INTO group_message_hourly
             (group_id, stat_date, stat_hour, user_id, message_type, message_count, character_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             message_count = message_count + VALUES(message_count),
             character_count = character_count + VALUES(character_count)`,
          [
            row.groupId,
            row.date,
            row.hour,
            row.userId,
            row.type,
            row.count,
            row.characters,
          ],
        );
        await connection.query(
          `INSERT INTO group_member_stats
             (group_id, user_id, display_name, total_messages, total_characters, last_message_at)
           VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
           ON DUPLICATE KEY UPDATE
             display_name = COALESCE(VALUES(display_name), display_name),
             total_messages = total_messages + VALUES(total_messages),
             total_characters = total_characters + VALUES(total_characters),
             last_message_at = UTC_TIMESTAMP()`,
          [row.groupId, row.userId, row.displayName, row.count, row.characters],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      for (const row of batch) {
        const key = `${row.groupId}\u0000${row.date}\u0000${row.hour}\u0000${row.userId}\u0000${row.type}`;
        const current = pending.get(key);
        if (current) {
          current.count += row.count;
          current.characters += row.characters;
        } else pending.set(key, row);
      }
      throw error;
    } finally {
      connection.release();
      flushPromise = null;
      if (pending.size) scheduleFlush();
    }
  })();
  return flushPromise;
}

async function recordMemberEvent({
  groupId,
  memberId,
  actorId = null,
  eventType,
  source = null,
  memberCount = null,
}) {
  if (!(await database.initialize())) return;
  const db = database.getPool().promise();
  await db.query(
    `INSERT INTO group_member_events
       (group_id, member_id, actor_id, event_type, source)
     VALUES (?, ?, ?, ?, ?)`,
    [groupId, memberId, actorId, eventType, source],
  );
  if (eventType === "invited" && actorId) {
    await db.query(
      `INSERT INTO group_member_stats (group_id, user_id, invitations_count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE invitations_count = invitations_count + 1`,
      [groupId, actorId],
    );
  }
  if (Number.isFinite(Number(memberCount))) {
    await snapshotMembers(groupId, Number(memberCount));
  }
}

async function snapshotMembers(groupId, memberCount) {
  if (!(await database.initialize())) return;
  await database
    .getPool()
    .promise()
    .query(
      `INSERT INTO group_metric_snapshots (group_id, stat_date, member_count)
     VALUES (?, UTC_DATE(), ?)
     ON DUPLICATE KEY UPDATE member_count = VALUES(member_count)`,
      [groupId, Math.max(0, Number(memberCount) || 0)],
    );
}

async function recordModeration({
  groupId,
  adminId = null,
  targetId = null,
  eventType,
  reason = null,
  metadata = null,
}) {
  if (!(await database.initialize())) return;
  await database
    .getPool()
    .promise()
    .query(
      `INSERT INTO group_moderation_events
       (group_id, admin_id, target_id, event_type, reason, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
      [
        groupId,
        adminId,
        targetId,
        eventType,
        reason,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
}

async function incrementWarning(groupId, userId) {
  if (!(await database.initialize())) return 0;
  const db = database.getPool().promise();
  await db.query(
    `INSERT INTO group_warning_state (group_id, user_id, warning_count)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE warning_count = warning_count + 1`,
    [groupId, userId],
  );
  const [rows] = await db.query(
    "SELECT warning_count FROM group_warning_state WHERE group_id = ? AND user_id = ?",
    [groupId, userId],
  );
  return Number(rows[0]?.warning_count || 0);
}

async function warningCount(groupId, userId) {
  if (!(await database.initialize())) return 0;
  const [rows] = await database
    .getPool()
    .promise()
    .query(
      "SELECT warning_count FROM group_warning_state WHERE group_id = ? AND user_id = ?",
      [groupId, userId],
    );
  return Number(rows[0]?.warning_count || 0);
}

async function clearWarning(groupId, userId) {
  if (!(await database.initialize())) return false;
  const [result] = await database
    .getPool()
    .promise()
    .query(
      "DELETE FROM group_warning_state WHERE group_id = ? AND user_id = ?",
      [groupId, userId],
    );
  return result.affectedRows > 0;
}

async function dashboard({ groupId, days = 30 }) {
  await flush();
  if (!(await database.initialize())) throw new Error("Database unavailable.");
  days = Math.min(365, Math.max(7, Number(days) || 30));
  const db = database.getPool().promise();
  const params = [groupId, days];
  // Include boundary padding so the browser can convert UTC buckets for UTC-12
  // through UTC+14 without losing the first/last local calendar day.
  const utcBucketParams = [groupId, days + 2];
  const [groupSettings] = await db.query(
    "SELECT COALESCE(timezone, 'Asia/Colombo') AS timezone FROM `groups` WHERE group_id = ?",
    [groupId],
  );
  const timezone = groupSettings[0]?.timezone || "Asia/Colombo";
  const [overviewRows] = await db.query(
    `SELECT
       (SELECT member_count FROM group_directory WHERE group_id = ?) AS members,
       COALESCE(SUM(message_count), 0) AS messages,
       COUNT(DISTINCT user_id) AS active_members,
       COALESCE(SUM(character_count), 0) AS characters
     FROM group_message_daily
     WHERE group_id = ? AND stat_date >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)`,
    [groupId, groupId, days],
  );
  const [messageSeries] = await db.query(
    `SELECT stat_date AS day, SUM(message_count) AS total
     FROM group_message_daily
     WHERE group_id = ? AND stat_date >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     GROUP BY stat_date ORDER BY stat_date`,
    params,
  );
  const [messageTypes] = await db.query(
    `SELECT stat_date AS day, message_type AS type, SUM(message_count) AS total
     FROM group_message_daily
     WHERE group_id = ? AND stat_date >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     GROUP BY stat_date, message_type ORDER BY stat_date`,
    params,
  );
  // Return UTC buckets without converting in SQL. The browser converts each
  // instant with Intl.DateTimeFormat and the group's current IANA timezone.
  const [hourly] = await db.query(
    `SELECT stat_date AS day, stat_hour AS hour, message_type AS type,
            SUM(message_count) AS total
     FROM group_message_hourly
     WHERE group_id = ? AND stat_date >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     GROUP BY stat_date, stat_hour, message_type
     ORDER BY stat_date, stat_hour`,
    utcBucketParams,
  );
  const [memberEvents] = await db.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%dT%H:00:00Z') AS bucket,
            event_type AS type, COUNT(*) AS total
     FROM group_member_events
     WHERE group_id = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
     GROUP BY DATE_FORMAT(created_at, '%Y-%m-%dT%H:00:00Z'), event_type
     ORDER BY bucket`,
    utcBucketParams,
  );
  const [moderation] = await db.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%dT%H:00:00Z') AS bucket,
            event_type AS type, COUNT(*) AS total
     FROM group_moderation_events
     WHERE group_id = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
     GROUP BY DATE_FORMAT(created_at, '%Y-%m-%dT%H:00:00Z'), event_type
     ORDER BY bucket`,
    utcBucketParams,
  );
  const [growth] = await db.query(
    `SELECT stat_date AS day, member_count AS total
     FROM group_metric_snapshots
     WHERE group_id = ? AND stat_date >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
     ORDER BY stat_date`,
    utcBucketParams,
  );
  const [topMembers] = await db.query(
    `SELECT user_id, display_name, total_messages,
            ROUND(total_characters / GREATEST(total_messages, 1)) AS average_characters,
            invitations_count
     FROM group_member_stats WHERE group_id = ? AND total_messages > 0
     ORDER BY total_messages DESC LIMIT 20`,
    [groupId],
  );
  const [topAdmins] = await db.query(
    `SELECT admin_id,
            COALESCE((SELECT display_name FROM contact_directory
                      WHERE identity_id = admin_id OR lid = admin_id OR jid = admin_id
                      LIMIT 1), admin_id) AS display_name,
            COUNT(*) AS actions,
            SUM(event_type='message_deleted') AS deletions,
            SUM(event_type IN ('member_removed','member_banned')) AS removals,
            SUM(event_type='warn') AS warnings,
            SUM(event_type IN ('group_muted','group_unmuted')) AS mute_actions
     FROM group_moderation_events
     WHERE group_id = ? AND admin_id IS NOT NULL
     GROUP BY admin_id ORDER BY actions DESC LIMIT 20`,
    [groupId],
  );
  const [sources] = await db.query(
    `SELECT COALESCE(source, event_type) AS source, COUNT(*) AS total
     FROM group_member_events
     WHERE group_id = ? AND event_type IN ('joined','invited')
       AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
     GROUP BY COALESCE(source, event_type) ORDER BY total DESC`,
    params,
  );
  return {
    days,
    timezone,
    overview: overviewRows[0] || {},
    series: {
      messages: messageSeries,
      messageTypes,
      hourly,
      memberEvents,
      moderation,
      growth,
    },
    topMembers,
    topAdmins,
    sources,
  };
}

async function ranking(groupId, mode = "global", limit = 15) {
  await flush();
  if (!(await database.initialize())) return [];
  const db = database.getPool().promise();
  if (mode === "daily" || mode === "weekly") {
    const interval = mode === "daily" ? 0 : 6;
    const [rows] = await db.query(
      `SELECT user_id AS id, SUM(message_count) AS count
       FROM group_message_daily
       WHERE group_id = ? AND stat_date >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
       GROUP BY user_id HAVING count > 0 ORDER BY count DESC LIMIT ?`,
      [groupId, interval, Number(limit)],
    );
    return rows;
  }
  const [rows] = await db.query(
    `SELECT user_id AS id, total_messages AS count
     FROM group_member_stats WHERE group_id = ? AND total_messages > 0
     ORDER BY total_messages DESC LIMIT ?`,
    [groupId, Number(limit)],
  );
  return rows;
}

async function memberRank(groupId, userId) {
  await flush();
  if (!(await database.initialize())) return null;
  const db = database.getPool().promise();
  const [members] = await db.query(
    `SELECT total_messages FROM group_member_stats WHERE group_id = ? AND user_id = ?`,
    [groupId, userId],
  );
  if (!members.length) return null;
  const total = Number(members[0].total_messages || 0);
  const [rankRows] = await db.query(
    `SELECT COUNT(*) + 1 AS position,
            (SELECT COUNT(*) FROM group_member_stats WHERE group_id = ?) AS total_members
     FROM group_member_stats WHERE group_id = ? AND total_messages > ?`,
    [groupId, groupId, total],
  );
  const [periods] = await db.query(
    `SELECT
       SUM(CASE WHEN stat_date = UTC_DATE() THEN message_count ELSE 0 END) AS daily,
       SUM(CASE WHEN stat_date >= DATE_SUB(UTC_DATE(), INTERVAL 6 DAY) THEN message_count ELSE 0 END) AS weekly
     FROM group_message_daily WHERE group_id = ? AND user_id = ?`,
    [groupId, userId],
  );
  return {
    position: Number(rankRows[0]?.position || 1),
    totalMembers: Number(rankRows[0]?.total_members || 0),
    total,
    daily: Number(periods[0]?.daily || 0),
    weekly: Number(periods[0]?.weekly || 0),
  };
}

async function topInviters(groupId, limit = 10) {
  await flush();
  if (!(await database.initialize())) return [];
  const [rows] = await database
    .getPool()
    .promise()
    .query(
      `SELECT user_id AS id, invitations_count AS count
     FROM group_member_stats WHERE group_id = ? AND invitations_count > 0
     ORDER BY invitations_count DESC LIMIT ?`,
      [groupId, Number(limit)],
    );
  return rows;
}

async function upsertContact(contact) {
  if (!(await database.initialize())) return;
  const identity = contact.id || contact.lid || contact.jid || contact.number;
  if (!identity) return;
  await database
    .getPool()
    .promise()
    .query(
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
}

module.exports = {
  clearWarning,
  dashboard,
  flush,
  incrementWarning,
  isTrackableMessage,
  memberRank,
  messageDetails,
  ranking,
  recordMemberEvent,
  recordMessage,
  recordModeration,
  snapshotMembers,
  topInviters,
  upsertContact,
  warningCount,
};
