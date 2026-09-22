"use strict";

/**
 * WhatsApp group metadata helpers.
 *
 * Baileys can represent the same account as a phone JID, LID, or a JID with a
 * device suffix. Comparing only `participant.id` (the old implementation) is
 * why a bot could appear non-admin after reconnect. These helpers compare all
 * identifiers and normalise device suffixes before deciding admin status.
 */
const database = require("./database");

function normalizeIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+(?=@)/, "");
}

function participantIds(participant) {
  if (!participant) return [];
  return [
    participant.id,
    participant.jid,
    participant.lid,
    participant.phoneNumber,
    participant.pn,
  ]
    .map(normalizeIdentity)
    .filter(Boolean);
}

function socketIds(socket) {
  const user = socket?.user || {};
  return [user.id, user.jid, user.lid, user.phoneNumber]
    .map(normalizeIdentity)
    .filter(Boolean);
}

function isAdmin(participant) {
  return ["admin", "superadmin"].includes(
    String(participant?.admin || "").toLowerCase(),
  );
}

function sameIdentity(a, b) {
  const left = new Set(
    Array.isArray(a) ? a.map(normalizeIdentity) : [normalizeIdentity(a)],
  );
  return (Array.isArray(b) ? b : [b])
    .map(normalizeIdentity)
    .filter(Boolean)
    .some((value) => left.has(value));
}

function isBotAdmin(socket, metadata) {
  const bot = socketIds(socket);
  if (!bot.length || !Array.isArray(metadata?.participants)) return false;
  return metadata.participants.some(
    (participant) =>
      isAdmin(participant) && sameIdentity(bot, participantIds(participant)),
  );
}

function isBotParticipant(socket, participant) {
  return sameIdentity(socketIds(socket), participantIds(participant));
}

function lidForParticipant(participant) {
  const lid = [participant?.lid, participant?.id, participant?.jid]
    .map(normalizeIdentity)
    .find((value) => value.endsWith("@lid"));
  return lid || null;
}

/**
 * Writes a fresh membership/admin snapshot. We replace the group membership
 * atomically so a demoted/removed user disappears from their panel immediately
 * after WhatsApp emits the corresponding participant event.
 */
async function syncGroupMetadata(socket, metadata) {
  if (!metadata?.id || !Array.isArray(metadata.participants)) return false;
  await database.initialize();
  const pool = database.getPool();
  const db = pool.promise();
  const groupId = metadata.id;

  // Depending on the WhatsApp client/version, group metadata may expose an
  // admin as a phone JID without an accompanying @lid. The web panel signs in
  // by LID, so resolve those phone JIDs through the canonical bot_users map
  // before writing the membership snapshot. Without this mapping a real admin
  // would silently disappear from the dashboard even though both they and the
  // bot are admins in WhatsApp.
  const [knownAccounts] = await db.query(
    `SELECT lid_username, whatsapp_jid
     FROM bot_users
     WHERE whatsapp_jid IS NOT NULL AND whatsapp_jid <> ''`,
  );
  const members = metadata.participants
    .map((participant) => {
      const directLid = lidForParticipant(participant);
      const mappedAccount = directLid
        ? null
        : knownAccounts.find((account) =>
            sameIdentity(participantIds(participant), account.whatsapp_jid),
          );
      return {
        userLid: directLid || normalizeIdentity(mappedAccount?.lid_username),
        displayName:
          String(
            participant.notify ||
              participant.name ||
              participant.pushName ||
              "",
          ).slice(0, 255) || null,
        isAdmin: isAdmin(participant),
      };
    })
    .filter((member) => member.userLid);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO group_directory (group_id, subject, member_count, bot_is_admin)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         subject = VALUES(subject),
         member_count = VALUES(member_count),
         bot_is_admin = VALUES(bot_is_admin),
         metadata_synced_at = CURRENT_TIMESTAMP`,
      [
        groupId,
        String(metadata.subject || "Unnamed group").slice(0, 255),
        metadata.participants.length,
        isBotAdmin(socket, metadata),
      ],
    );
    await connection.query(
      "DELETE FROM group_admin_memberships WHERE group_id = ?",
      [groupId],
    );
    if (members.length) {
      await connection.query(
        `INSERT INTO group_admin_memberships
          (group_id, user_lid, display_name, is_admin)
         VALUES ?`,
        [
          members.map((member) => [
            groupId,
            member.userLid,
            member.displayName,
            member.isAdmin,
          ]),
        ],
      );
    }
    await connection.query(
      `INSERT INTO group_metric_snapshots (group_id, stat_date, member_count)
       VALUES (?, UTC_DATE(), ?)
       ON DUPLICATE KEY UPDATE member_count = VALUES(member_count)`,
      [groupId, metadata.participants.length],
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Fetches fresh metadata rather than relying on a pre-restart cache. */
async function refreshAndSyncGroup(socket, groupId, clearCache) {
  if (!socket || !groupId) return null;
  if (typeof clearCache === "function") clearCache(groupId);
  const metadata = await socket.groupMetadata(groupId);
  await syncGroupMetadata(socket, metadata);
  return metadata;
}

async function syncAllGroups(socket, groups = null) {
  const directory = groups || (await socket.groupFetchAllParticipating());
  const entries = Object.entries(directory || {});
  const results = await Promise.allSettled(
    entries.map(async ([groupId, metadata]) => {
      const fullMetadata =
        metadata?.participants?.length !== undefined
          ? { ...metadata, id: metadata.id || groupId }
          : await socket.groupMetadata(groupId);
      return syncGroupMetadata(socket, fullMetadata);
    }),
  );
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length) {
    console.warn(`[group-directory] ${failed.length} group sync(s) failed.`);
  }
  console.log(
    `[group-directory] Synced ${entries.length - failed.length}/${entries.length} groups.`,
  );
  return { total: entries.length, failed: failed.length };
}

module.exports = {
  normalizeIdentity,
  participantIds,
  socketIds,
  isAdmin,
  sameIdentity,
  isBotAdmin,
  isBotParticipant,
  syncGroupMetadata,
  refreshAndSyncGroup,
  syncAllGroups,
};
