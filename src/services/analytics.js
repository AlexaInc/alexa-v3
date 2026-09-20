"use strict";
const crypto = require("crypto");
const database = require("./database");

const hashId = (value) => value ? crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 32) : null;

async function record({ command, groupId, userId, status = "received", durationMs = 0 }) {
  try {
    if (!(await database.initialize())) return;
    await database.getPool().promise().query(
      "INSERT INTO command_events (command_name, group_id, user_id_hash, status, duration_ms) VALUES (?, ?, ?, ?, ?)",
      [String(command).slice(0, 100), groupId || null, hashId(userId), String(status).slice(0, 32), Math.max(0, Math.round(durationMs))],
    );
  } catch (error) { console.error("[analytics]", error.message); }
}

async function summary({ days = 7, groupId = null } = {}) {
  await database.initialize();
  days = Math.min(90, Math.max(1, Number(days) || 7));
  const filter = groupId ? " AND group_id = ?" : "";
  const params = groupId ? [days, groupId] : [days];
  const db = database.getPool().promise();
  const [totals] = await db.query(`SELECT COUNT(*) total, COUNT(DISTINCT user_id_hash) active_users, SUM(status='error') errors FROM command_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)${filter}`, params);
  const [commands] = await db.query(`SELECT command_name, COUNT(*) uses FROM command_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)${filter} GROUP BY command_name ORDER BY uses DESC LIMIT 12`, params);
  const [daily] = await db.query(`SELECT DATE(created_at) day, COUNT(*) uses FROM command_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)${filter} GROUP BY DATE(created_at) ORDER BY day`, params);
  return { days, totals: totals[0], commands, daily };
}
module.exports = { hashId, record, summary };
